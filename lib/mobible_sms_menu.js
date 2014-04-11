var vumigo = require("vumigo_v01");
var jed = require("jed");

if (api === undefined) {
  // testing hook (supplies api when it is not passed in by the real sandbox)
  var api = this.api = new vumigo.dummy_api.DummyApi();
}

var FreeText = vumigo.states.FreeText;
var EndState = vumigo.states.EndState;
var ChoiceState = vumigo.states.ChoiceState;
var PaginatedChoiceState = vumigo.states.PaginatedChoiceState;
var Choice = vumigo.states.Choice;
var InteractionMachine = vumigo.state_machine.InteractionMachine;
var StateCreator = vumigo.state_machine.StateCreator;
var HttpApi = vumigo.http_api.HttpApi;
var Promise = vumigo.promise.Promise;


function MobibleBase(first_state) {
  var self = this;
  StateCreator.call(self, first_state);

  self.api_url = function (reference) {
    return ('https://bibles.org/v2/' + encodeURI(im.config.version) +
            '/passages.js?q[]=' + encodeURI(reference));
  };

  self.query = function (reference) {
    var api = new HttpApi(im, {
      auth: {username: im.config.token, password: "X"}
    });
    var p = api.get(self.api_url(reference));
    p.add_callback(function (response) {
      return JSON.parse(response);
    });
    p.add_callback(self.parse_result, reference);
    return p;
  };

  self.scrub = function (raw) {
    var text = raw.replace(/<(?:.|\n)*?>/gm, ''); // scrub HTML
    var silly_verse_ref_prefix = /(\d+)(.+)/gm; // turn `16John` into `16. John`
    if (text.search(silly_verse_ref_prefix) > -1) {
      text = text.replace(silly_verse_ref_prefix, "$1. $2");
    }
    return text // remove bad quotes
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"');
  };

  self.parse_result = function (result, reference) {
    var passages = result.response.search.result.passages;
    if (passages.length === 0) {
      return im.config.help;
    }

    return passages.map(function (passage) {
      return self.scrub(passage.text);
    }).join('.');
  };

  self.send_sms = function (msisdn, sms) {
    var sms_tag = im.config.sms_tag;
    return im.api_request('outbound.send_to_tag', {
      to_addr: msisdn,
      content: sms,
      tagpool: sms_tag[0],
      tag: sms_tag[1]
    });
  };
}

var MobibleSMSMenu = function () {
  var self = this;
  MobibleBase.call(self, 'start');

  self.has_registered = function (contact) {
    return contact.name && contact.surname;
  };

  self.add_creator('start', function (state_name, im) {
    var p = self.get_user(im.user_addr);
    p.add_callback(function (result) {
      var contact = result.contact;
      var items = [
        new Choice('add_friend_name', 'Add a friend'),
        new Choice('share_verse', 'Share a verse'),
        new Choice('receive_instructions', 'Receive instructions for u & ur friends'),
        new Choice('manage_group', 'Unsubscribe from groups')
      ];
      // insert this as the first menu item if we don't have a
      // name & surname
      if(!self.has_registered(contact)) {
        items.unshift(new Choice('name', 'Create free account!'));
      }
      return new ChoiceState(
        state_name,
        function (choice) {
          return choice.value;
        },
        'Welcome to Mobible!', items
      );
    });
    return p;
  });

  self.add_state(new FreeText(
    'name',
    'surname',
    'What\'s your name?'
  ));

  self.add_state(new FreeText(
    'surname',
    'save_settings',
    'What\'s your surname?'
  ));

  self.add_creator('save_settings', function (state_name, im) {
    var p = self.get_user(im.user_addr);
    p.add_callback(function(result) {
      var contact = result.contact;
      contact.name = im.get_user_answer('name');
      contact.surname = im.get_user_answer('surname');
      return im.api_request('contacts.update', {
        key: contact.key,
        fields: {
          name: im.get_user_answer('name'),
          surname: im.get_user_answer('surname')
        }
      });
    });
    p.add_callback(function (result) {
      return new ChoiceState(
        state_name,
        function (choice) {
          return choice.value;
        },
        'Thanks! Your settings have been saved! You can now share verses.',
        [
          new Choice('start', 'Return to main menu.')
        ]
        );
    });
    return p;
  });

  self.add_state(new FreeText(
    'add_friend_name',
    'add_friend_number',
    'What is your friend\'s name?'
  ));

  self.normalize_msisdn = function(raw, country_code) {
      if (raw.indexOf("00") === 0) {
          return "+" + raw.slice(2);
      }
      if (raw.indexOf("0") === 0) {
          return "+" + country_code + raw.slice(1);
      }
      if (raw.indexOf("+") === 0) {
          return raw;
      }
      if (raw.indexOf(country_code) === 0) {
          return "+" + raw;
      }
      return raw;
  };

  self.get_user = function (msisdn) {
    return im.api_request('contacts.get_or_create', {
      delivery_class: 'ussd',
      addr: self.normalize_msisdn(msisdn, '27')
    });
  };

  self.get_or_create_mobible_contact = function (name, msisdn) {
    var p = self.get_user(msisdn);
    p.add_callback(function (result) {
      var contact = result.contact;
      if(self.has_registered(contact)) {
        return im.api_request('contacts.update', {
          key: contact.key,
          fields: {
            name: name
          }
        });
      }
      return result;
    });
    return p;
  };


  self.is_group_member = function(group, contact) {
    return contact.groups.indexOf(group.key) != -1;
  };

  self.add_to_group = function (group, name, msisdn) {
    var p = self.get_or_create_mobible_contact(name, msisdn);
    p.add_callback(function (result) {
      var contact = result.contact;
      if (!self.is_group_member(group, contact)) {
        contact.groups.push(group.key);
      }
      return im.api_request('contacts.update', {
        key: contact.key,
        fields: {
          groups: contact.groups
        }
      });
    });
    return p;
  };

  self.get_group = function () {
    var p = im.api_request('groups.get_or_create_by_name', {
      name: 'Mobible group for ' + im.user_addr
    });
    p.add_callback(function(result) {
      return result.group;
    });
    return p;
  };

  self.send_to_group = function (group, content) {
    var p = im.api_request('contacts.search', {
      query: 'groups:' + group.key
    });
    p.add_callback(function (result) {
      var contact_keys = result.keys;
      var sms_p = new Promise();
      contact_keys.forEach(function (contact_key) {
        sms_p.add_callback((function () {
          return function() {
            var contact_p = im.api_request('contacts.get_by_key', {
              key: contact_key
            });
            contact_p.add_callback(function(result) {
              var contact = result.contact;
              return self.send_sms(contact.msisdn, content);
            });
            return contact_p;
          };
        })());
      });
      sms_p.callback();
      return sms_p;
    });
    return p;
  };

  self.get_groups = function (group_keys) {
    var p = new Promise();
    group_keys.forEach(function(group_key) {
      p.add_callback((function() {
        return function(collector) {
          var group_p = im.api_request('groups.get', {
            key: group_key
          });
          group_p.add_callback(function (result) {
            collector.push(result.group);
            return collector;
          });
          return group_p;
        };
      })());
    });
    p.callback([]);
    return p;
  };

  self.get_groups_for_user = function (user) {
    var groups_p = self.get_groups(user.groups);
    groups_p.add_callback(function (groups) {
      return groups.filter(function(group) {
        return group.name.indexOf('Mobible group for ') > -1;
      });
    });
    groups_p.add_callback(function (groups) {
      var user_p = new Promise();
      groups.forEach(function(group) {
        user_p.add_callback((function() {
          return function(collector) {
            var msisdn = group.name.replace('Mobible group for ', '');
            var up = im.api_request('contacts.get_or_create', {
              delivery_class: 'ussd',
              addr: msisdn
            });
            up.add_callback(function(result) {
              var contact = result.contact;
              group.name = contact.name + ' ' + contact.surname + '\'s group';
              collector.push(group);
              return collector;
            });
            return up;
          };
        })());
      });
      user_p.callback([]);
      return user_p;
    });
    return groups_p;
  };

  self.add_state(new FreeText(
    'add_friend_number',
    'end',
    'What is your friend\'s phone number?',
    null,
    null,
    {
      on_exit: function () {
        var name = im.get_user_answer('add_friend_name'),
            number = im.get_user_answer('add_friend_number');

        var p = self.get_group();
        p.add_callback(function(group) {
          return self.add_to_group(group, name, number);
        });
        return p;
      }
    }
  ));

  self.add_state(new EndState(
    'end',
    'Thanks!',
    'start'
  ));

  self.add_creator('share_verse', function (state_name, im) {
    var p = self.get_user(im.user_addr);
    p.add_callback(function(result) {
      var contact = result.contact;
      if(contact.name && contact.surname) {
        return new FreeText(
          state_name,
          'confirm_verse',
          'Which verse would you like to share? ' +
          '(\'John 3:12\', \'John 3:12-15\' for example)'
        );
      } else {
        return new ChoiceState(
          state_name,
          function (choice) {
            return choice.value;
          },
          ('You need to create an account ' +
           'before you can share verses. '),
          [
            new Choice('name', 'Create your free account!'),
            new Choice('start', 'Return to main menu.')
          ]
        );
      }
    });
    return p;
  });

  self.add_creator('confirm_verse', function (state_name, im) {
    var reference = im.get_user_answer('share_verse');
    var p = self.query(reference);
    p.add_callback(function (content) {
      im.set_user_answer('_cached_verse_content', content);
      return new ChoiceState(
        state_name,
        function (choice) {
          return {
            'group': 'share_with_group',
            'myself': 'share_with_me',
            'retry': 'share_verse'
          }[choice.value];
        },
        (reference + ' starts with \'' + content.slice(4, 60) + '...\' \n' +
         'Who would you like to share this with?'),
        [
          new Choice('myself', 'Myself'),
          new Choice('group', 'My Group'),
          new Choice('retry', 'Try again')
        ]);
    });
    return p;
  });

  self.add_creator('share_with_me', function (state_name, im) {
    var p = self.send_sms(im.user_addr, im.get_user_answer('_cached_verse_content'));
    p.add_callback(function() {
      return new EndState(state_name, 'Verse sent via SMS!', 'start');
    });
    return p;
  });

  self.add_creator('share_with_group', function (state_name, im) {
    return new EndState(state_name, 'Verse sent via SMS!', 'start', {
      on_enter: function() {
        var p = self.get_group();
        p.add_callback(function (group) {
          var up = self.get_user(im.user_addr);
          up.add_callback(function(result) {
            var user = result.contact;
            return self.send_to_group(group, (
              'Your friend ' + user.name + ' has shared ' +
              im.get_user_answer('share_verse') + ' with you: ' +
              im.get_user_answer('_cached_verse_content') +
              '. Dial *120*8864*1252# and start sharing!'));
          });
          return up;
        });
        return p;
      }
    });
  });

  self.add_creator('receive_instructions', function (state_name, im) {
    var p = self.send_sms(im.user_addr, im.config.instructions);
    p.add_callback(function() {
      return new EndState(
        state_name,
        'Instructions sent via SMS!',
        'start');
    });
    return p;
  });

  self.add_creator('manage_group', function (state_name, im) {
    var p = self.get_user(im.user_addr);
    p.add_callback(function (result) {
      return self.get_groups_for_user(result.contact);
    });
    p.add_callback(function (groups) {
      if(groups.length === 0) {
        return new ChoiceState(
          state_name,
          function(choice) {
            return choice.value;
          },
          'You\'re not part of any groups.',
          [
            new Choice('start', 'Go back to the start menu.')
          ]
        );
      } else {
        return new PaginatedChoiceState(
          state_name,
          'manage_single_group',
          'Manage group:',
          groups.map(function (group) {
            return new Choice(group.key, group.name);
          }),
          null,
          null,
          {
            back: null,
            more: null
          }
        );
      }
    });
    return p;
  });

  self.add_state(new ChoiceState(
    'manage_single_group',
    function (choice) {
      return choice.value;
    },
    'What would you like to do?',
    [
      new Choice('unsubscribe_group', 'Unsubscribe.'),
      new Choice('start', 'Go back to the start menu.')
    ]
  ));

  self.add_creator('unsubscribe_group', function (state_name, im) {
    var p = self.get_user(im.user_addr);
    p.add_callback(function(result) {
      var contact = result.contact;
      var group_key = im.get_user_answer('manage_group');
      var index = contact.groups.indexOf(group_key);
      if(index > -1) {
        contact.groups.splice(index, 1);
      }
      return im.api_request('contacts.update', {
        key: contact.key,
        fields: {
          groups: contact.groups
        }
      });
    });
    p.add_callback(function() {
      return new ChoiceState(
        state_name,
        function (choice) {
          return choice.value;
        },
        'You\'ve unsubscribed from the group',
        [
          new Choice('start', 'Return to the main menu.')
        ]);
    });
    return p;
  });
};

// launch app
var states = new MobibleSMSMenu();
var im = new InteractionMachine(api, states);
im.attach();
