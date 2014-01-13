var describe = global.describe,
  it = global.it,
  beforeEach = global.beforeEach;

var fs = require("fs");
var assert = require("assert");
var app = require("../lib/mobible_sms");
var vumigo = require("vumigo_v01");


var make_api_endpoint_aware = function(api) {

  if(api.is_endpoint_aware) {
    return api;
  }

  // Hot wire endpoint support for the testing harnass
  api.set_configured_endpoint = function (endpoint) {
    api._configured_endpoint = endpoint;
  };

  api.get_configured_endpoint = function () {
    return api._configured_endpoint || 'default';
  };

  var original_on_inbound_message = api.on_inbound_message;
  api.on_inbound_message = function(cmd) {
    cmd.msg.routing_metadata = {
      endpoint: api.get_configured_endpoint()
    };
    return original_on_inbound_message(cmd);
  };

  api.is_endpoint_aware = true;

  return api;
};

var assert_sms_outbox = function (api, outbox) {
  outbox.forEach(function(ob_sms, index) {
    var sms = api.outbound_sends[index];
    assert.equal(sms.to_addr, ob_sms.to_addr);
    assert.ok(sms.content.match(ob_sms.content),
      sms.content + 'does not match ' + ob_sms.content);
  });
};

describe("Mobible SMS", function () {

  var fixtures = [
    'test/fixtures/john416.json',
    'test/fixtures/john4016.json'
  ];

  var tester;

  beforeEach(function () {
    tester = new vumigo.test_utils.ImTester(app.api, {
      custom_setup: function (api) {
        api.config_store.config = JSON.stringify({
          version: 'eng-ESV',
          token: 'foo',
          help: ("Sorry, no verse found. Please try the following formats. " +
                 "'John 3', 'John 3-5', 'John 3:12', 'John 3:12-15', " +
                 "'John 3,Luke 2'")
        });

        if (!api.is_endpoint_aware) {
          make_api_endpoint_aware(api);
        }
        api.set_configured_endpoint('longcode:default10235');

        fixtures.forEach(function (f) {
          api.load_http_fixture(f);
        });
      },
      async: true
    });
  });

  it('should be able to text in a verse reference and receive an SMS', function (done) {
    tester.check_state({
      user: null,
      content: 'john 4:16',
      next_state: 'start',
      response: "^16. Jesus said to her, \"Go, call your husband, and come here.\"",
      continue_session: false
    }).then(done, done);

  });

  it('should reply with help if no results found', function (done) {
    tester.check_state({
      user: null,
      content: 'john 40:16',
      next_state: 'start',
      response: ("^Sorry, no verse found. Please try the following formats. " +
                 "'John 3', 'John 3-5', 'John 3:12', 'John 3:12-15', " +
                 "'John 3,Luke 2'"),
      continue_session: false
    }).then(done, done);

  });

});

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

        if (!api.is_endpoint_aware) {
          make_api_endpoint_aware(api);
        }
        api.set_configured_endpoint('default');

        var group = api.add_group({
          'name': 'Mobible group for 1234567'
        });

        var contact1 = api.add_contact({msisdn: '+1111'});
        var contact2 = api.add_contact({msisdn: '+2222'});

        api.set_contact_search_results('groups:' + group.key, [
          contact1, contact2]);

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
      response: '^Welcome to Mobible!'
    }).then(done, done);
  });

  describe('when adding friends', function () {
    it('should ask for the name when adding a friend to a group.', function (done) {
      tester.check_state({
        user: {
          current_state: 'start'
        },
        content: '1',
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
        content: '1234',
        next_state: 'end',
        response: '^Thanks!',
        continue_session: false
      }).then(function() {
        var group_keys = Object.keys(app.api.group_store);

        // assert group created
        assert.equal(group_keys.length, 1);
        var group = app.api.group_store[group_keys[0]];
        assert.equal(group.name, 'Mobible group for 1234567');

        // assert contact created
        var contact = app.api.find_contact('ussd', '1234');
        assert.equal(contact.groups.length, 1);
        assert.equal(contact.groups[0], group.key);

      }).then(done, done);
    });
  });

  describe('when sharing a verse', function () {
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
          {to_addr: '+1111', content: /16\. Jesus said to her/},
          {to_addr: '+2222', content: /16\. Jesus said to her/}
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
      content: '3',
      next_state: 'receive_instructions',
      response: 'Instructions sent via SMS!',
      continue_session: false
    }).then(function () {
      assert_sms_outbox(app.api, [
        {to_addr: '1234567', content: 'the instructions'}
      ]);
    }).then(done, done);
  });
});