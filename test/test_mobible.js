var fs = require("fs");
var assert = require("assert");
var app = require("../lib/mobible");

describe("test_api", function() {
    it("should exist", function() {
        assert.ok(app.api);
    });
    it("should have an on_inbound_message method", function() {
        assert.ok(app.api.on_inbound_message);
    });
    it("should have an on_inbound_event method", function() {
        assert.ok(app.api.on_inbound_event);
    });
});

function reset_im(im) {
    im.user = null;
    im.i18n = null;
    im.i18n_lang = null;
    im.current_state = null;
}

function fresh_api() {
    var api = app.api;
    api.reset();
    reset_im(api.im);
    return api;
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

describe("test_ussd_states_for_session_1", function() {
    it("new users should see the language state", function () {
        check_state(null, null, "language",
            "^Please select your language:[^]" +
            "1. English[^]" +
            "2. Afrikaans[^]" +
            "3. Xhosa[^]" +
            "4. Sotho$");
    });

    it("returning users should see the select_discovery_journey",
       function() {
         check_state({current_state: "language"}, "2", "select_discovery_journey",
            "^Select your");
    });

    // it("returning non-afrikaans users should see the generic_end",
    //    function() {
    //      check_state({current_state: "language"}, "3", "discovery_journey",
    //         "Cheers!");
    // });

    it("invalid languages should repeat the state",
        function() {
         check_state({current_state: "language"}, "500", "language",
            "^Please select your language");
    });

    it("returning users should see thankfulness",
        function() {
            check_state({current_state: "select_discovery_journey"}, "1", 
                "thankfulness", "^Ask everyone");
    });

    it("returning users should see the greatest_need",
       function() {
         check_state({current_state: "thankfulness"}, "eh?", "greatest_need",
            "^Ask everyone to share their");
    });

    it("returning users should see the prayer",
       function() {
         check_state({current_state: "greatest_need"}, "eh?", "prayer",
            "^Please take a few");
       });



    // it("reply 'title' to report_title should go to description", function() {
    //     check_state({current_state: "report_title"}, "the title",
    //         "report_description",
    //         "^What is the event description?"
    //     );
    // });
    // it("reply 'description' to report_description should go to category",
    //     function() {
    //         check_state({current_state: "report_description"}, "the description",
    //             "report_category",
    //             "^Select a category:[^]" +
    //             "1. Category 1[^]" +
    //             "2. Category 2[^]" +
    //             "3. Category 3[^]" +
    //             "4. Trusted Reports$"
    //        );
    //     });
    // it("reply '1' to report_category should go to address",
    //     function() {
    //         check_state({current_state: "report_category"}, "1",
    //             "report_location",
    //             "^Please type in the address"
    //        );
    //     });
    // it("reply 'address' to report_location should come with some suggestions",
    //     function() {
    //         check_state({current_state: "report_location"}, "the address",
    //             "select_location",
    //             "^Select a match:[^]" +
    //             "1. 1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA[^]" +
    //             "2. None of the above$"
    //         );
    //     });
    // it("reply 'address' to report_location should come with some suggestions",
    //     function() {
    //         check_state({current_state: "report_location"}, "the address",
    //             "select_location",
    //             "^Select a match:[^]" +
    //             "1. 1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA[^]" +
    //             "2. None of the above$"
    //         );
    //     });
    // it("reply '2' to select_location should try again",
    //     function() {
    //         check_state({current_state: "select_location"}, "2",
    //             "report_location",
    //             "^Please type in the address"
    //         );
    //     });
    // it("reply '1' to select_location should submit the report",
    //     function() {
    //         var user = {
    //             current_state: "select_location",
    //             answers: {
    //                 report_title: 'The title',
    //                 report_description: 'The description',
    //                 report_category: '1'
    //             }
    //         };
    //         check_state(user, "1",
    //             "submit_report",
    //             "^Thank you, your report has been submitted"
    //         );
    //     });

});
