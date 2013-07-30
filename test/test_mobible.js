var fs = require("fs");
var assert = require("assert");
var app = require("../lib/mobible");
var vumigo = require("vumigo_v01");

describe("Mobible", function() {

    var fixtures = [
        'test/fixtures/languages.json',
        'test/fixtures/introductions.json',
        'test/fixtures/journeys.json'
    ];

    var tester;

    beforeEach(function() {
        tester = new vumigo.test_utils.ImTester(app.api, {
            custom_setup: function(api) {
                api.config_store.config = JSON.stringify({
                    sms_tag: ['pool', 'addr']
                });
                api.add_contact({
                    'msisdn': '+1234567',
                    'extras-mobible-join': new Date().toISOString()
                });
                fixtures.forEach(function (f) {
                    api.load_http_fixture(f);
                });
            },
            async: true
        });
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

    it("users should see the language state", function (done) {
        tester.check_state({
            user: null,
            content: null,
            next_state: 'language',
            response: "^Please select your language:[^]" +
                        "1. English[^]" +
                        "2. Afrikaans[^]" +
                        "3. Xhosa[^]" +
                        "4. Sotho$"
        }).then(done, done);
    });

    describe('returning users', function() {
        it("should see the select_discovery_journey", function(done) {
            tester.check_state({
                user: {
                    current_state: "language"
                },
                content: "1",
                next_state: "select_discovery_journey",
                response: "^Select your discovery journey:[^]" +
                            "1. Journey 1[^]" +
                            "2. Journey 2[^]" +
                            "3. Journey 3[^]" +
                            "4. Journey 4$"
            }).then(function() {
                var contact = app.api.find_contact('ussd', '+1234567');
                assert.equal(contact['extras-mobible-language'], 'en-us');
            }).then(done, done);
        });
    });

    describe('new users', function() {
        it("should see the introduction end screen", function(done) {
            tester.check_state({
                user: {
                    current_state: "language"
                },
                content: "2",
                next_state: "introduction",
                response: "^Welcome to your first",
                from_addr: '1000',
                continue_session: false
            }).then(function() {
                var contact = app.api.find_contact('ussd', '+1000');
                assert.equal(contact['extras-mobible-language'], 'af-za');
            }).then(done, done);
        });
    });

    it("invalid languages should repeat the state", function(done) {
        tester.check_state({
            user: {current_state: "language"},
            content: "500",
            next_state: "language",
            response: "^Please select your language"
        }).then(done, done);
    });

    it("returning users should see thankfulness", function(done) {
        tester.check_state({
            user: {
                current_state: "select_discovery_journey",
                answers: {
                    language: 'en-us'
                }
            },
            content: "1",
            next_state: "thankfulness",
            response: "^Ask everyone",
            continue_session: false
        }).then(done, done);
    });

    it("returning users should see the greatest_need", function(done) {
        tester.check_state({
            user: {current_state: "thankfulness"},
            content: "eh?",
            next_state: "greatest_need",
            response: "^Ask everyone to share their",
            continue_session: false
        }).then(done, done);
    });

    it("returning users should see the prayer", function(done) {
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
        }).then(done, done);
    });

    it("Returning after prayer we should continue to the discover journey", function(done) {
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
        }).then(done, done);
    });

    it('returning users should discovery_journey1_obey', function(done) {
        tester.check_state({
            user: {current_state: 'discovery_journey1'},
            content: 'eh?',
            next_state: 'discovery_journey1_obey',
            response: '^How will you obey this truth today\\?',
            continue_session: false
        }).then(done, done);
    });

    it('returning users should discovery_journey1_commit', function(done) {
        tester.check_state({
            user: {current_state: 'discovery_journey1_obey'},
            content: 'eh?',
            next_state: 'discovery_journey1_commit',
            response: '^Consider 2 people'
        }).then(done, done);
    });

    it('replying yes to forwarding gives option to type numbers', function(done) {
        tester.check_state({
            user: {current_state: 'discovery_journey1_commit'},
            content: '1',
            next_state: 'share_via_sms',
            response: '^Please type in the phone number'
        }).then(done, done);
    });

    it('should forward the story via SMS if asked to do so', function(done) {
        var user_data = {
            current_state: 'share_via_sms'
        };
        tester.check_state({
            user: user_data,
            content: '27761234567',
            next_state: 'shared',
            response: '^The SMS has been sent,',
            teardown: assert_single_sms('27761234567', '^Genesis 1:1-25: In the beginning')
        }).then(done, done);
    });

    it('should end when done with sharing', function(done) {
        var user_data = {
            current_state: 'shared'
        };
        tester.check_state({
            user: user_data,
            content: '2',
            next_state: 'end',
            response: '^Thanks for doing this DBS,',
            continue_session: false
        }).then(done, done);
    });

    it('replying no to forwarding closes the session', function(done) {
        tester.check_state({
            user: {current_state: 'discovery_journey1_commit'},
            content: '2',
            next_state: 'end',
            response: '^Thanks for doing this DBS',
            continue_session: false
        }).then(done, done);
    });

});
