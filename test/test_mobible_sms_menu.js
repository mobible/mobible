var describe = global.describe,
  it = global.it,
  beforeEach = global.beforeEach;

var fs = require("fs");
var assert = require("assert");
var app = require("../lib/mobible_sms_menu");
var vumigo = require("vumigo_v01");


var assert_sms_outbox = function (api, outbox) {
  outbox.forEach(function(ob_sms, index) {
    var sms = api.outbound_sends[index];
    assert.equal(sms.to_addr, ob_sms.to_addr);
    assert.ok(sms.content.match(ob_sms.content),
      sms.content + 'does not match ' + ob_sms.content);
  });
};


describe('Mobible SMS Menu', function () {

  var fixtures = [
    'test/fixtures/john416.json',
    'test/fixtures/john4016.json'
  ];

  var tester;

  beforeEach(function () {
    tester = new vumigo.test_utils.ImTester(app.api, {
      custom_setup: function (api) {
        api.config_store.config = JSON.stringify({
          sms_tag: ['foo', 'bar'],
          version: 'eng-ESV',
          token: 'foo',
          help: ("Sorry, no verse found. Please try the following formats. " +
                 "'John 3', 'John 3-5', 'John 3:12', 'John 3:12-15', " +
                 "'John 3,Luke 2'"),
          instructions: 'the instructions'
        });

        var group = api.add_group({
          'name': 'Mobible group for 1234567'
        });

        var contact1 = api.add_contact({msisdn: '+1111'});
        var contact2 = api.add_contact({msisdn: '+2222'});

        api.set_contact_search_results('groups:' + group.key, [
          contact1.key, contact2.key]);

        fixtures.forEach(function (f) {
          api.load_http_fixture(f);
        });
      },
      async: true
    });
  });

  it('should display the menu when first connecting', function (done) {
    tester.check_state({
      user: null,
      content: null,
      next_state: 'start',
      response: '^WELCOME TO MOBIBLE!'
    }).then(done, done);
  });

  it('should allow for setting the name', function (done) {
    tester.check_state({
      user: {
        current_state: 'start'
      },
      content: '1',
      next_state: 'name',
      response: '^What\'s your name\?'
    }).then(done, done);
  });

  it('should allow for setting the surname', function (done) {
    tester.check_state({
      user: {
        current_state: 'name',
      },
      content: 'Foo',
      next_state: 'surname',
      response: '^What\'s your surname\?'
    }).then(done, done);
  });

  it('should save the name & surname', function (done) {
    tester.check_state({
      user: {
        current_state: 'surname',
        answers: {
          name: 'Foo'
        }
      },
      content: 'Bar',
      next_state: 'save_settings',
      response: '^Thanks! Your settings have been saved.'
    }).then(function () {
      var contact = app.api.find_contact('ussd', '+1234567');
      assert.equal(contact.name, 'Foo');
      assert.equal(contact.surname, 'Bar');
    }).then(done, done);
  });

  describe('when adding friends', function () {
    it('should ask for the name when adding a friend to a group.', function (done) {
      tester.check_state({
        user: {
          current_state: 'start'
        },
        content: '2',
        next_state: 'add_friend_name',
        response: '^What is your friend\'s name\?'
      }).then(done, done);
    });

    it('should ask for the number after having asked the name.', function (done) {
      tester.check_state({
        user: {
          current_state: 'add_friend_name'
        },
        content: 'foo',
        next_state: 'add_friend_number',
        response: '^What is your friend\'s phone number\?'
      }).then(done, done);
    });

    it('should add the friend to the group', function (done) {
      tester.check_state({
        user: {
          current_state: 'add_friend_number',
          answers: {
            'add_friend_name': 'foo'
          }
        },
        content: '0761234567',
        next_state: 'add_another_friend',
        response: '^Do you want to add another friend\?'
      }).then(function() {
        var group_keys = Object.keys(app.api.group_store);

        // assert group created
        assert.equal(group_keys.length, 1);
        var group = app.api.group_store[group_keys[0]];
        assert.equal(group.name, 'Mobible group for 1234567');

        // assert contact created
        var contact = app.api.find_contact('ussd', '+27761234567');
        assert.equal(contact.groups.length, 1);
        assert.equal(contact.groups[0], group.key);

      }).then(done, done);
    });

    it('should allow for adding another friend', function (done) {
      tester.check_state({
        user: {
          current_state: 'add_another_friend'
        },
        content: '1',
        next_state: 'add_friend_name',
        response: '^What is your friend\'s name\?'
      }).then(done, done);
    });

    it('should allow for not adding another friend', function (done) {
      tester.check_state({
        user: {
          current_state: 'add_another_friend'
        },
        content: '2',
        next_state: 'end',
        response: '^You have added your friend!',
        continue_session: false
      }).then(done, done);
    });

    it('should suggest account creation before sharing verses', function (done) {
      tester.check_state({
        user: {
          current_state: 'start'
        },
        next_state: 'share_verse',
        content: '3',
        response: '^You need to create an account'
      }).then(done, done);
    });
  });

  describe('when sharing a verse', function () {

    beforeEach(function () {
      tester = new vumigo.test_utils.ImTester(app.api, {
        custom_setup: function (api) {
          api.config_store.config = JSON.stringify({
            sms_tag: ['foo', 'bar'],
            version: 'eng-ESV',
            token: 'foo',
            help: ("Sorry, no verse found. Please try the following formats. " +
                   "'John 3', 'John 3-5', 'John 3:12', 'John 3:12-15', " +
                   "'John 3,Luke 2'"),
            instructions: 'the instructions'
          });

          var group = api.add_group({
            'name': 'Mobible group for 1234567'
          });

          // this fakes the user having created an account.
          api.add_contact({
            msisdn: '+1234567',
            name: 'Foo',
            surname: 'Bar'
          });

          var contact1 = api.add_contact({msisdn: '+1111'});
          var contact2 = api.add_contact({msisdn: '+2222'});

          api.set_contact_search_results('groups:' + group.key, [
            contact1.key, contact2.key]);

          fixtures.forEach(function (f) {
            api.load_http_fixture(f);
          });
        },
        async: true
      });
    });

    it('should ask for a verse reference', function (done) {
      tester.check_state({
        user: {
          current_state: 'start'
        },
        content: '2',
        next_state: 'share_verse',
        response: '^Which verse would you like to share\?'
      }).then(done, done);
    });

    it('should confirm the verse when given a reference', function (done) {
      tester.check_state({
        user: {
          current_state: 'share_verse'
        },
        content: 'john 4:16',
        next_state: 'confirm_verse',
        response: ('^john 4:16 starts with \'Jesus said to her, "Go, call ' +
                   'your husband, and come here...\'')
      }).then(done, done);
    });

    it('should share with the group', function (done) {
      tester.check_state({
        user: {
          current_state: 'confirm_verse',
          answers: {
            'share_verse': 'john 4:16'
          }
        },
        content: '2',
        next_state: 'share_with_group',
        response: 'Verse sent via SMS!',
        continue_session: false
      }).then(function() {
        assert_sms_outbox(app.api, [
          {
            to_addr: '+1111',
            content: /Your friend Foo has shared john 4:16 with you: 16\. Jesus said to her/
          },
          {
            to_addr: '+2222',
            content: /Your friend Foo has shared john 4:16 with you: 16\. Jesus said to her/
          }
        ]);
      }).then(done, done);
    });

    it('should share with the individual', function (done) {
      tester.check_state({
        user: {
          current_state: 'confirm_verse',
          answers: {
            'share_verse': 'john 4:16'
          }
        },
        content: '1',
        next_state: 'share_with_me',
        response: 'Verse sent via SMS!',
        continue_session: false
      }).then(function() {
        assert_sms_outbox(app.api, [
          {to_addr: '1234567', content: /16\. Jesus said to her/}
        ]);
      }).then(done, done);
    });

    it('should allow for a retry', function (done) {
      tester.check_state({
        user: {
          current_state: 'confirm_verse',
          answers: {
            'share_verse': 'john 4:16'
          }
        },
        content: '3',
        next_state: 'share_verse',
        response: 'Which verse would you like to share\?'
      }).then(done, done);
    });
  });

  it('should send instructions', function (done) {
    tester.check_state({
      user: {
        current_state: 'start'
      },
      content: '4',
      next_state: 'receive_instructions',
      response: 'Instructions sent via SMS!',
      continue_session: false
    }).then(function () {
      assert_sms_outbox(app.api, [
        {to_addr: '1234567', content: 'the instructions'}
      ]);
    }).then(done, done);
  });

  describe('when managing groups', function() {

    var tester;
    var group;

    beforeEach(function () {
      tester = new vumigo.test_utils.ImTester(app.api, {
        custom_setup: function (api) {
          api.config_store.config = JSON.stringify({
            sms_tag: ['foo', 'bar'],
            version: 'eng-ESV',
            token: 'foo',
            help: ("Sorry, no verse found. Please try the following formats. " +
                   "'John 3', 'John 3-5', 'John 3:12', 'John 3:12-15', " +
                   "'John 3,Luke 2'"),
            instructions: 'the instructions'
          });

          group = api.add_group({
            'key': 'some-group',
            'name': 'Mobible group for 00000000'
          });

          api.add_contact({
            msisdn: '+00000000',
            name: 'Some',
            surname: 'Person'
          });

          // this fakes the user having created an account.
          api.add_contact({
            msisdn: '+1234567',
            name: 'Foo',
            surname: 'Bar',
            groups: [group.key]
          });

          var contact1 = api.add_contact({msisdn: '+1111'});
          var contact2 = api.add_contact({msisdn: '+2222'});

          api.set_contact_search_results('groups:' + group.key, [
            contact1.key, contact2.key]);

          fixtures.forEach(function (f) {
            api.load_http_fixture(f);
          });
        },
        async: true
      });
    });

    it('should list groups the current user is subscribed to', function (done) {
      // subscriber here is registered so we're not showing the
      // Create Account! menu item which means manage_group is item 4.
      tester.check_state({
        user: {
          current_state: 'start'
        },
        content: '4',
        next_state: 'manage_group',
        response: (
          '^Manage group:[^]' +
          '1. Some Person\'s group')
      }).then(done, done);
    });

    it('should give the option for unsubscribing', function (done) {
      tester.check_state({
        user: {
          current_state: 'manage_group'
        },
        content: '1',
        next_state: 'manage_single_group',
        response: '^What would you like to do\?'
      }).then(done, done);
    });

    it('should allow unsubscribing', function (done) {
      tester.check_state({
        user: {
          current_state: 'manage_single_group',
          answers: {
            'manage_group': 'some-group'
          }
        },
        content: '1',
        next_state: 'unsubscribe_group',
        response: '^You\'ve unsubscribed from the group'
      }).then(function() {
        var contact = app.api.find_contact('ussd', '+1234567');
        assert.equal(contact.name, 'Foo');
        assert.equal(contact.surname, 'Bar');
        assert.equal(contact.groups.length, 0);
      }).then(done, done);
    });

    it('should allow returning to main menu if not member of any group.', function (done) {
      tester.check_state({
        user: {
          current_state: 'start'
        },
        from_addr: '27761234567',
        content: '5',
        next_state: 'manage_group',
        response: (
          '^You\'re not part of any groups.[^]' +
          '1. Go back to the start menu.$')
      }).then(done, done);
    });

    it('should return to the main menu if there are no groups.', function (done) {
      tester.check_state({
        user: {
          current_state: 'manage_group'
        },
        from_addr: '27761234567',
        content: '1',
        next_state: 'start',
        response: '^WELCOME TO MOBIBLE!'
      }).then(done, done);
    });

  });
});