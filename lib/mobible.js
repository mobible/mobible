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

    self.add_state(new ChoiceState(
        "language",
        function(choice) {
            // if(choice.value == "afrikaans") {
            //     return "afrikaans_end";
            // } else {
            //     return "generic_end";
            // }
            return "select_discovery_journey";
        },
        "Please select your language:",
        [
            new Choice("english", "English"),
            new Choice("afrikaans", "Afrikaans"),
            new Choice("xhosa", "Xhosa"),
            new Choice("sotho", "Sotho")
        ]
    ));

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
        "discovery_journey1_obey"
    ));

    self.add_state(new EndState(
        "discovery_journey1_obey",
        "How will you obey this trust today?" +
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
        "end",
        "Please type in the phone numbers separated by a comma."
    ));

    self.add_state(new EndState(
        "end",
        "Thanks for doing this DBS, the next scripture will be available" +
            "the next time you dial in. Feel free to share this number " +
            "with others leading DBSs"

    ));

    // self.add_state(new EndState(
    //     "afrikaans_end",
    //     "Baie dankie!",
    //     "language"
    // ));

    // self.add_state(new EndState(
    //     "generic_end", // where am I now
    //     "Cheers!", // what do I display?
    //     "language" // where do we go from here?
    // ));
}

// launch app
var states = new Mobible();
var im = new InteractionMachine(api, states);
im.attach();