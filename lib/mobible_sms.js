var vumigo = require("vumigo_v01");
var jed = require("jed");

if (api === undefined) {
  // testing hook (supplies api when it is not passed in by the real sandbox)
  var api = this.api = new vumigo.dummy_api.DummyApi();
}

var FreeText = vumigo.states.FreeText;
var EndState = vumigo.states.EndState;
var ChoiceState = vumigo.states.ChoiceState;
var Choice = vumigo.states.Choice;
var InteractionMachine = vumigo.state_machine.InteractionMachine;
var StateCreator = vumigo.state_machine.StateCreator;
var HttpApi = vumigo.http_api.HttpApi;
var Promise = vumigo.promise.Promise;


function SMSEndState(name, text, next, handlers) {
  // State that mimicks the USSD behaviour when a USSD session ends
  // it fast forwards to the start of the InteractionMachine.
  // We need to do this because SMS doesn't have the Session capabities
  // that provide us this functionality when using USSD.
  var self = this;
  handlers = handlers || {};
  if (handlers.on_enter === undefined) {
    handlers.on_enter = function () {
      self.input_event('', function () {});
    };
  }
  EndState.call(self, name, text, next, handlers);
}

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

var MobibleSMS = function () {
  var self = this;
  self.kind = 'sms-interface';
  MobibleBase.call(self, 'start');

  self.add_state(new FreeText(
    'start',
    'end',
    'You should never see this'
  ));

  self.add_creator('end', function (state_name, im) {
    var p = self.query(im.get_user_answer('start'));
    p.add_callback(function (content) {
      return new SMSEndState(state_name, content, 'start');
    });
    return p;
  });
};

var MobibleSMSMenu = function () {
  var self = this;
  self.kind = 'sms-menu';
  MobibleBase.call(self, 'start');

  self.add_state(new ChoiceState(
    'start',
    function(choice) {
      return choice.value;
    },
    'Welcome to Mobible!', [
      new Choice('add_friend_name', 'Add a friend to your Mobible group.'),
      new Choice('share_verse', 'Share a verse with your Mobible group.'),
      new Choice('receive_instructions', 'Receive instructions for u & ur friends.')
    ]
  ));

  self.add_state(new FreeText(
    'add_friend_name',
    'add_friend_number',
    'What is your friend\'s name?'
  ));

  self.get_user = function (msisdn) {
    return im.api_request('contacts.get_or_create', {
      delivery_class: 'ussd',
      addr: msisdn
    });
  };

  self.get_or_create_mobible_contact = function (name, msisdn) {
    var p = self.get_user(msisdn);
    p.add_callback(function (result) {
      var contact = result.contact;
      if(result.created) {
        contact.name = name;
        return im.api_request('contacts.save', {
          contact: contact
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
      return im.api_request('contacts.save', {
        contact: contact
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

  self.add_state(new FreeText(
    'share_verse',
    'confirm_verse',
    'Which verse would you like to share? ' +
    '(\'John 3:12\', \'John 3:12-15\' for example)'
  ));

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
    var p = self.get_group();
    p.add_callback(function (group) {
      return self.send_to_group(group, im.get_user_answer('_cached_verse_content'));
    });
    p.add_callback(function(group) {
      return new EndState(state_name, 'Verse sent via SMS!', 'start');
    });
    return p;
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
};

var EndpointAwareInteractionMachine = function (api, state_machines) {

  var self = this;
  self.state_machines = state_machines;

  InteractionMachine.call(self, api, state_machines['default']);

  // Keep references to the original handlers before overwriting them.
  self.originals = {
    on_inbound_message: self.on_inbound_message,
    on_inbound_event: self.on_inbound_event
  };

  // An object with ``endpoint_name`` -> ``StateCreator`` mappings
  self.state_machines = state_machines;

  self.get_endpoint = function(msg) {
    var routing_metadata = msg.routing_metadata || {};
    return routing_metadata.endpoint || 'default';
  };

  self.get_state_machine = function(endpoint) {
    return self.state_machines[endpoint];
  };

  self.on_inbound_message = function (cmd) {
    self.state_creator = self.get_state_machine(self.get_endpoint(cmd.msg));
    return self.originals.on_inbound_message(cmd);
  };

  self.on_inbound_event = function (cmd) {
    self.state_creator = self.get_state_machine(self.get_endpoint(cmd.msg));
    return self.originals.on_inbound_event(cmd);
  };
};

// launch app
var im = new EndpointAwareInteractionMachine(api, {
  'default': new MobibleSMSMenu(),
  'longcode:default10235': new MobibleSMS()
});
im.attach();