var vumigo = require("vumigo_v01");
var jed = require("jed");

if (api === undefined) {
  // testing hook (supplies api when it is not passed in by the real sandbox)
  var api = this.api = new vumigo.dummy_api.DummyApi();
}

var FreeText = vumigo.states.FreeText;
var EndState = vumigo.states.EndState;
var InteractionMachine = vumigo.state_machine.InteractionMachine;
var StateCreator = vumigo.state_machine.StateCreator;
var HttpApi = vumigo.http_api.HttpApi;


function SMSEndState(name, text, next, handlers) {
  // State that mimicks the USSD behaviour when a USSD session ends
  // it fast forwards to the start of the InteractionMachine.
  // We need to do this because SMS doesn't have the Session capabities
  // that provide us this functionality when using USSD.
  var self = this;
  handlers = handlers || {};
  if (handlers.on_enter === undefined) {
    handlers.on_enter = function () {
      self.input_event('', function () {});
    };
  }
  EndState.call(self, name, text, next, handlers);
}


function MobibleSMS() {
  var self = this;
  StateCreator.call(self, 'start');

  self.api_url = function (reference) {
    return ('https://bibles.org/v2/' + encodeURI(im.config.version) +
            '/passages.js?q[]=' + encodeURI(reference));
  };

  self.query = function (reference) {
    var api = new HttpApi(im, {
      auth: {username: im.config.token, password: "X"}
    });
    var p = api.get(self.api_url(reference));
    p.add_callback(function (response) {
      return JSON.parse(response);
    });
    p.add_callback(self.parse_result, reference);
    return p;
  };

  self.scrub = function (raw) {
    var text = raw.replace(/<(?:.|\n)*?>/gm, ''); // scrub HTML
    var silly_verse_ref_prefix = /(\d+)(.+)/gm; // turn `16John` into `16. John`
    if (text.search(silly_verse_ref_prefix) > -1) {
      text = text.replace(silly_verse_ref_prefix, "$1. $2");
    }
    return text // remove bad quotes
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"');
  };

  self.parse_result = function (result, reference) {
    var passages = result.response.search.result.passages;
    if (passages.length === 0) {
      return im.config.help;
    }

    return passages.map(function (passage) {
      return self.scrub(passage.text);
    }).join('.');
  };

  self.add_state(new FreeText(
    'start',
    'end',
    'You should never see this'
  ));

  self.add_creator('end', function (state_name, im) {
    var p = self.query(im.get_user_answer('start'));
    p.add_callback(function (content) {
      return new SMSEndState(state_name, content, 'start');
    });
    return p;
  });
}

// launch app
var states = new MobibleSMS();
var im = new InteractionMachine(api, states);
im.attach();
