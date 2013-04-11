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
    StateCreator.call(self, 'start');

    self.add_state(new FreeText(
        "start", // what's this thing called
        "end",   // where do we go from here?
        "Welcome to mobible!" // the text to display.
    ));

    self.add_state(new EndState(
        "end", // where am I now
        "Cheers!", // what do I display?
        "start" // where do we go from here?
    ));
}

// launch app
var states = new Mobible();
var im = new InteractionMachine(api, states);
im.attach();