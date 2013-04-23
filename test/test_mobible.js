var fs = require("fs");
var assert = require("assert");
var app = require("../lib/mobible");

function fresh_api() {
    var api = app.api;
    api.reset();
    reset_im(api.im);
    return api;
}

function reset_im(im) {
    im.user = null;
    im.i18n = null;
    im.i18n_lang = null;
    im.current_state = null;
}

function maybe_call(f, that, args) {
    if (typeof f != "undefined" && f !== null) {
        f.apply(that, args);
    }
}

function check_state(user, content, next_state, expected_response, setup,
                     teardown) {
    // setup api
    var api = fresh_api();
    var from_addr = "1234567";
    var user_key = "users." + from_addr;
    api.kv_store[user_key] = user;

    maybe_call(setup, this, [api]);

    api.add_reply({
        cmd: "outbound.reply_to"
    });

    // send message
    api.on_inbound_message({
        cmd: "inbound-message",
        msg: {
            from_addr: from_addr,
            content: content,
            message_id: "123"
        }
    });

    // check result
    var saved_user = api.kv_store[user_key];
    assert.equal(saved_user.current_state, next_state);
    var reply = api.request_calls.shift();
    var response = reply.content;
    try {
        assert.ok(response);
        assert.ok(response.match(expected_response));
        assert.ok(response.length <= 163);
    } catch (e) {
        console.log(api.logs);
        console.log(response);
        console.log(expected_response);
        if (typeof response != 'undefined')
            console.log("Content length: " + response.length);
        throw e;
    }
    assert.deepEqual(app.api.request_calls, []);
    assert.equal(app.api.done_calls, 1);

    maybe_call(teardown, this, [api, saved_user]);
}

function check_close(user, next_state, setup, teardown) {
    var api = fresh_api();
    var from_addr = "1234567";
    var user_key = "users." + from_addr;
    api.kv_store[user_key] = user;

    maybe_call(setup, this, [api]);

    // send message
    api.on_inbound_message({
        cmd: "inbound-message",
        msg: {
            from_addr: from_addr,
            session_event: "close",
            content: "User Timeout",
            message_id: "123"
        }
    });

    // check result
    var saved_user = api.kv_store[user_key];
    assert.equal(saved_user.current_state, next_state);
    assert.deepEqual(app.api.request_calls, []);
    assert.equal(app.api.done_calls, 1);

    maybe_call(teardown, this, [api, saved_user]);
}


function CustomTester(custom_setup, custom_teardown) {
    var self = this;

    self._combine_setup = function(custom_setup, orig_setup) {
        var combined_setup = function (api) {
            maybe_call(custom_setup, self, [api]);
            maybe_call(orig_setup, this, [api]);
        };
        return combined_setup;
    };

    self._combine_teardown = function(custom_teardown, orig_teardown) {
        var combined_teardown = function (api, saved_user) {
            maybe_call(custom_teardown, self, [api, saved_user]);
            maybe_call(orig_teardown, this, [api, saved_user]);
        };
        return combined_teardown;
    };

    self.check_state = function(user, content, next_state, expected_response,
                                setup, teardown) {
        return check_state(user, content, next_state, expected_response,
                           self._combine_setup(custom_setup, setup),
                           self._combine_teardown(custom_teardown, teardown));
    };

    self.check_close = function(user, next_state, setup, teardown) {
        return check_close(user, next_state,
                           self._combine_setup(custom_setup, setup),
                           self._combine_teardown(custom_teardown, teardown));
    };
}


function check_state(user, content, next_state, expected_response, setup,
                     teardown) {
    // setup api
    var api = fresh_api();
    var from_addr = "1234567";
    var user_key = "users." + from_addr;
    api.kv_store[user_key] = user;

    maybe_call(setup, this, [api]);

    api.add_reply({
        cmd: "outbound.reply_to"
    });

    // send message
    api.on_inbound_message({
        cmd: "inbound-message",
        msg: {
            from_addr: from_addr,
            content: content,
            message_id: "123"
        }
    });

    // check result
    var saved_user = api.kv_store[user_key];
    assert.equal(saved_user.current_state, next_state);
    var reply = api.request_calls.shift();
    var response = reply.content;
    try {
        assert.ok(response);
        assert.ok(response.match(expected_response));
        assert.ok(response.length <= 163);
    } catch (e) {
        console.log(api.logs);
        console.log(response);
        console.log(expected_response);
        if (typeof response != 'undefined')
            console.log("Content length: " + response.length);
        throw e;
    }
    assert.deepEqual(app.api.request_calls, []);
    assert.equal(app.api.done_calls, 1);

    maybe_call(teardown, this, [api, saved_user]);
}

describe("test_ussd_states_for_session_1", function() {

    var fixtures = [];

    var tester = new CustomTester(function (api) {
        api.config_store.config = JSON.stringify({
            sms_tag: ['pool', 'addr']
        });
        fixtures.forEach(function (f) {
            api.load_http_fixture(f);
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

    it("new users should see the language state", function () {
        tester.check_state(null, null, "language",
            "^Please select your language:[^]" +
            "1. English[^]" +
            "2. Afrikaans[^]" +
            "3. Xhosa[^]" +
            "4. Sotho$");
    });

    it("returning users should see the select_discovery_journey", function() {
        tester.check_state({current_state: "language"}, "2", "select_discovery_journey",
            "^Select your");
    });

    it("invalid languages should repeat the state", function() {
        tester.check_state({current_state: "language"}, "500", "language",
            "^Please select your language");
    });

    it("returning users should see thankfulness", function() {
        tester.check_state({current_state: "select_discovery_journey"}, "1",
            "thankfulness", "^Ask everyone");
    });

    it("returning users should see the greatest_need", function() {
        check_state({current_state: "thankfulness"}, "eh?", "greatest_need",
            "^Ask everyone to share their");
    });

    it("returning users should see the prayer", function() {
        var user_data = {
            current_state: "greatest_need",
            answers: {
                "select_discovery_journey": "discovery_journey1"
            }
        };
        tester.check_state(user_data, "eh?", "prayer",
            "^Please take a few");
    });

    it("Returning after prayer we should continue to the discover journey", function() {
        var user_data = {
            current_state: "prayer",
            answers: {
                "select_discovery_journey": "discovery_journey1"
            }
        };
        tester.check_state(user_data, "eh?", "discovery_journey1",
            "^Your story for today", null,
            assert_single_sms('1234567', '^In the beginning'));
    });
});
