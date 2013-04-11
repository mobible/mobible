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
            return "discovery_journey";
        },
        "Please select your language:",
        [
            new Choice("english", "English"),
            new Choice("afrikaans", "Afrikaans"),
            new Choice("xhosa", "Xhosa"),
            new Choice("sotho", "Sotho")
        ]
        ));

    self.add_state(new EndState(
        "discovery_journey",
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
        "language"
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