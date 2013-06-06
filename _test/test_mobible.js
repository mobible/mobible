var fs = require("fs");
var assert = require("assert");
var app = require("../lib/mobible");
var vumigo = require("vumigo_v01");

describe("test_ussd_states_for_session_1", function() {

    var fixtures = [];

    var tester = new vumigo.test_utils.ImTester(app.api, {
        custom_setup: function(api) {
            api.config_store.config = JSON.stringify({
                sms_tag: ['pool', 'addr']
            });
            fixtures.forEach(function (f) {
                api.load_http_fixture(f);
            });
        }
    });

    var assert_single_sms = function(to_addr, content) {
        var teardown = function(api) {
            var sms = api.outbound_sends[0];
            assert.equal(api.outbound_sends.length, 1);
            assert.equal(sms.to_addr, to_addr);
            assert.ok(sms.content.match(content));
        };
        return teardown;
    };

    it("new users should see the language state", function () {
        tester.check_state({
            user: null,
            content: null,
            next_state: 'language',
            response: "^Please select your language:[^]" +
                        "1. English[^]" +
                        "2. Afrikaans[^]" +
                        "3. Xhosa[^]" +
                        "4. Sotho$"
        });
    });

    it("returning users should see the select_discovery_journey", function() {
        tester.check_state({
            user: {current_state: "language"},
            content: "2",
            next_state: "select_discovery_journey",
            response: "^Select your"
        });
    });

    it("invalid languages should repeat the state", function() {
        tester.check_state({
            user: {current_state: "language"},
            content: "500",
            next_state: "language",
            response: "^Please select your language"
        });
    });

    it("returning users should see thankfulness", function() {
        tester.check_state({
            user: {current_state: "select_discovery_journey"},
            content: "1",
            next_state: "thankfulness",
            response: "^Ask everyone",
            continue_session: false
        });
    });

    it("returning users should see the greatest_need", function() {
        tester.check_state({
            user: {current_state: "thankfulness"},
            content: "eh?",
            next_state: "greatest_need",
            response: "^Ask everyone to share their",
            continue_session: false
        });
    });

    it("returning users should see the prayer", function() {
        var user_data = {
            current_state: "greatest_need",
            answers: {
                "select_discovery_journey": "discovery_journey1"
            }
        };
        tester.check_state({
            user: user_data,
            content: "eh?",
            next_state: "prayer",
            response: "^Please take a few",
            continue_session: false
        });
    });

    it("Returning after prayer we should continue to the discover journey", function() {
        var user_data = {
            current_state: "prayer",
            answers: {
                "select_discovery_journey": "discovery_journey1"
            }
        };
        tester.check_state({
            user: user_data,
            content: "eh?",
            next_state: "discovery_journey1",
            response: "^Your story for today",
            teardown: assert_single_sms('1234567', '^Genesis 1:1-25: In the beginning'),
            continue_session: false
        });
    });

    it('returning users should discovery_journey1_obey', function() {
        tester.check_state({
            user: {current_state: 'discovery_journey1'},
            content: 'eh?',
            next_state: 'discovery_journey1_obey',
            response: '^How will you obey this truth today\\?',
            continue_session: false
        });
    });

    it('returning users should discovery_journey1_commit', function() {
        tester.check_state({
            user: {current_state: 'discovery_journey1_obey'},
            content: 'eh?',
            next_state: 'discovery_journey1_commit',
            response: '^Consider 2 people'
        });
    });

    it('replying yes to forwarding gives option to type numbers', function() {
        tester.check_state({
            user: {current_state: 'discovery_journey1_commit'},
            content: '1',
            next_state: 'share_via_sms',
            response: '^Please type in the phone number'
        });
    });

    it('should forward the story via SMS if asked to do so', function() {
        var user_data = {
            current_state: 'share_via_sms'
        };
        tester.check_state({
            user: user_data,
            content: '27761234567',
            next_state: 'shared',
            response: '^The SMS has been sent,',
            teardown: assert_single_sms('27761234567', '^Genesis 1:1-25: In the beginning')
        });
    });

    it('should end when done with sharing', function() {
        var user_data = {
            current_state: 'shared'
        };
        tester.check_state({
            user: user_data,
            content: '2',
            next_state: 'end',
            response: '^Thanks for doing this DBS,',
            continue_session: false
        });
    });

    it('replying no to forwarding closes the session', function() {
        tester.check_state({
            user: {current_state: 'discovery_journey1_commit'},
            content: '2',
            next_state: 'end',
            response: '^Thanks for doing this DBS',
            continue_session: false
        });
    });

});