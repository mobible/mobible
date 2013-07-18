var vumigo = require("vumigo_v01");
var jed = require("jed");

if (typeof api === "undefined") {
    // testing hook (supplies api when it is not passed in by the real sandbox)
    var api = this.api = new vumigo.dummy_api.DummyApi();
    var test_utils = require('../test/utils.js');
}

var Promise = vumigo.promise.Promise;
var success = vumigo.promise.success;
var Choice = vumigo.states.Choice;
var ChoiceState = vumigo.states.ChoiceState;
var FreeText = vumigo.states.FreeText;
var EndState = vumigo.states.EndState;
var InteractionMachine = vumigo.state_machine.InteractionMachine;
var StateCreator = vumigo.state_machine.StateCreator;


function Mobible() {
    var self = this;
    StateCreator.call(self, 'language');

    // self.add_state(new FreeText(
    //     "start", // what's this thing called
    //     "end",   // where do we go from here?
    //     "Welcome to mobible!" // the text to display.
    // ));

    self.stories = [
        {
            title: "Genesis 1:1-25 The Creation of the World",
            text: "Genesis 1:1-25: " +
                    "In the beginning, God created the heavens and the earth. " +
                    "The earth was without form and void, and darkness was over " +
                    "the face of the deep. And the Spirit of God was hovering over " +
                    "the face of the waters. And God said, \"Let there be light,\" " +
                    "and there was light..."
        }, {
            title: "Genesis 1:26-31",
            text: "Read Genesis 1:26-31 ..."
        }, {
            title: "Genesis 2:15-16",
            text: "Genesis 2:15-16 ..."
        }
    ];

    self.send_sms = function(im, to_addr, content) {
        var sms_tag = im.config.sms_tag;
        if (!sms_tag) return success(true);
        var p = new Promise();
        im.api.request("outbound.send_to_tag", {
            to_addr: to_addr,
            content: content,
            tagpool: sms_tag[0],
            tag: sms_tag[1]
        }, function(reply) {
            p.callback(reply.success);
        });
        return p;
    };

    self.url = function(im, path) {
        return 'http://dev.mobible.org/api/v1' + path;
    };

    self.update_contact_fields = function(im, fields) {
        var p = im.api_request('contacts.get_or_create', {
            delivery_class: 'ussd',
            addr: im.user_addr
        });
        p.add_callback(function(result) {
            var contact = result.contact;
            return im.api_request('contacts.update_extras', {
                key: contact.key,
                fields: fields
            });
        });
        return p;
    };

    self.add_creator('language', function(state_name, im) {
        var p = im.api_request('http.get', {
            url: self.url(im, '/language/'),
            headers: {
                'content-type': 'application/json'
            }
        });
        p.add_callback(function(response) {
            return JSON.parse(response.body).objects;
        });
        p.add_callback(function(languages) {
            return new ChoiceState(
                state_name,
                "select_discovery_journey",
                "Please select your language:",
                languages.map(function(language) {
                    return new Choice(language.language_code, language.display_name);
                }),
                null,
                {
                    on_exit: function() {
                        return self.update_contact_fields(im, {
                            'mobible-language': im.get_user_answer('language')
                        });
                    }
                }
            );
        });
        return p;
    });

    self.add_state(new ChoiceState(
        "select_discovery_journey",
        function(choice) {
            return "thankfulness";
        },
        "Select your discovery journey:",
        [
            new Choice("discovery_journey1", "God's Character"),
            new Choice("discovery_journey1", "Creation"),
            new Choice("discovery_journey1", "Rebellion"),
            new Choice("discovery_journey1", "Sinful Man")
        ]
    ));

    self.add_state(new EndState(
        "thankfulness",
        "Ask everyone to share something they are thankful for." +
            "Once everyone has shared, please dial in again.",
        "greatest_need"
    ));

    self.add_state(new EndState(
        "greatest_need",
        "Ask everyone to share their greatest need. Ask if there is " +
            "anyone in the group that can meet the need." +
            "Once everyone has shared, please dial in again.",
        "prayer"
    ));

    self.add_state(new EndState(
        "prayer",
        "Please take a few minutes to pray for the needs of each other " +
            "and give thanks for what has God has done." +
            "Once everyone has shared, please dial in again.",
        function() {
            return im.get_user_answer("select_discovery_journey");
        }
    ));

    self.add_state(new EndState(
        "discovery_journey1",
        "Your story for today is about God's character. " +
            "You will now receive an SMS with instructions.",
        "discovery_journey1_obey",
        {
            on_enter: function() {
                return self.send_sms(im, im.user_addr, self.stories[0].text);
            }
        }
    ));

    self.add_state(new EndState(
        "discovery_journey1_obey",
        "How will you obey this truth today?" +
            "Please share within the group.",
        "discovery_journey1_commit"
    ));

    self.add_state(new ChoiceState(
        "discovery_journey1_commit",
        function(choice) {
            return choice.value == "yes" ? "share_via_sms" : "end";
        },
        "Consider 2 people in your lives to share this story with." +
            "Would you like to forward them the story via SMS?",
        [
            new Choice("yes", "Yes please!"),
            new Choice("no", "No thanks.")
        ]
    ));

    self.add_state(new FreeText(
        "share_via_sms",
        "shared",
        "Please type in the phone number."
    ));

    self.add_state(new ChoiceState(
        "shared",
        function(choice) {
            return choice.value == "yes" ? "share_via_sms" : "end";
        },
        "The SMS has been sent, do you want to forward to someone else?",
        [
            new Choice("yes", "Yes please!"),
            new Choice("no", "No thanks")
        ],
        null,
        {
            on_enter: function() {
                var forward = im.get_user_answer('share_via_sms');
                var sms_text = self.stories[0].text;
                return self.send_sms(im, forward, sms_text);
            }
        }
    ));

    self.add_state(new EndState(
        "end",
        "Thanks for doing this DBS, the next scripture will be available" +
            "the next time you dial in. Feel free to share this number " +
            "with others leading DBSs",
        "language"
    ));
}

// launch app
var states = new Mobible();
var im = new InteractionMachine(api, states);
im.attach();