var describe = global.describe,
  it = global.it,
  beforeEach = global.beforeEach;

var fs = require("fs");
var assert = require("assert");
var app = require("../lib/mobible_sms");
var vumigo = require("vumigo_v01");

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

        fixtures.forEach(function (f) {
          api.load_http_fixture(f);
        });
      },
      async: true
    });
  });

  var assert_smss = function (to_addr, messages) {
    var teardown = function (api) {
      assert.equal(api.outbound_sends.length, messages.length);
      api.outbound_sends.forEach(function (sms, index) {
        assert.equal(sms.to_addr, to_addr);
        assert.ok(sms.content.match(messages[index]));
      });
    };
    return teardown;
  };

  var assert_single_sms = function (to_addr, content) {
    return assert_smss(to_addr, [content]);
  };


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
