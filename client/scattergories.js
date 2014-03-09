////////// Main client application logic //////////

//////
////// Utility functions
//////

var game = function() {
  var me = player();
  return me && me.game_id && Games.findOne(me.game_id);
};

var player = function() {
  return Players.findOne(playerId());
};

var playerId = function() {
  return Session.get('player_id');
};

var room = function() {
  var pathSplit = window.location.pathname.split('/');
  if (pathSplit.length >= 2 && pathSplit[1] != '') {
    return decodeURI(pathSplit[1]);
  }
  return '';
}

//////
////// lobby template: shows everyone not currently playing, and
////// offers a button to start a fresh game.
//////

Template.lobby.rendered = function() {
  if (player() && player().name) {
    $('#name-input').val(player().name);
  }
}

Template.lobby.disabled = function() {
  return !(player() && player().name.length > 0);
}

Template.lobby.show = function() {
  // only show lobby if we're not in a game
  return !game();
};

Template.lobby.room = function() {
  return room();
}

Template.lobby.waiting = function () {
  var players = Players.find({_id: {$ne: playerId()},
                              name: {$ne: ''},
                              room: room(),
                              idle: false,
                              game_id: {$exists: false}}).fetch();
  if (players.length > 0) {
    return players;
  } else {
    return null;
  }
};

Template.lobby.events({
  'keyup #name-input': function (evt) {
    var name = $('#name-input').val().trim();
    Players.update(playerId(), {$set: {name: name}});
  },
  'click #startgame, tap #startgame': function() {
    Meteor.call('start_new_game', room());
  }
});

Template.ready.show = function() {
  return game() && game().state == 'active' && game().ready_clock > 0;
}

Template.ready.ready_clock = function() {
  return game() && game().ready_clock;
}

Template.ready.others = function() {
  var players = [];
  var g = game();
  for (var ii = 0, len = g.players.length; ii < len; ii++) {
    if (g.players[ii]._id != playerId()) {
      players.push(g.players[ii].name);
    }
  }
  return players;
}

Template.board.show = function() {
  return game() && game().state == 'active' && game().ready_clock == 0;
};

Template.board.letter = function() {
  return game() && game().letter;
};

Template.board.clock = function() {
  var clock = game() && game().clock;

  if (clock <= 0) {
    var answers = [];
    $('#answers').find('input').each(function() {
      answers.push($(this).val());
      $(this).attr('disabled', 'disabled');
    });
    Meteor.call('submit_answers', playerId(), game()._id, answers);    
    return;
  }

  if (!clock) {
    return;
  }

  // format into M:SS
  var min = Math.floor(clock / 60);
  var sec = clock % 60;
  return min + ':' + (sec < 10 ? ('0' + sec) : sec);
};

Template.board.categories = function() {
  return game() && game().categories;
};

Template.board.answers = function() {
  var result = [];
  for (var ii = 0; ii < 12; ii++) {
    result.push(ii);
  }
  return result;
};

Template.judgment.show = function() {
  return game() && game().state == 'judgment';
};

Template.judgment.waiting = function() {
  var g = game();
  for (var ii = 0, len = g.judgments.length; ii < len; ii++) {
    if (g.judgments[ii].player_id == playerId()) {
      return true;
    }
  }
  return false;
}

Template.judgment.players = function() {
  var g = game();
  var judged = {};
  for (var ii = 0, len = g.judgments.length; ii < len; ii++) {
    judged[g.judgments[ii].player_id] = true;
  }

  var playerIds = [];
  var result = [];
  for (var ii = 0, len = g.players.length; ii < len; ii++) {
    var playerId = g.players[ii]._id;
    if (!judged[playerId]) {
      result.push(g.players[ii].name);
    }
  }
  return result;
}

Template.judgment.categories = function() {
  var g = game();
  var categories = g.categories;
  var submitted = g.submitted;
  var duplicates = g.duplicates;
  var result = [];
  for (var ii = 0; ii < 12; ii++) {
    var answerSet = {};
    for (var jj = 0, len = submitted.length; jj < len; jj++) {
      var answer = submitted[jj].answers[ii].entry;
      answerSet[answer] = true;
    }
    for (var jj = 0, len = duplicates[ii].length; jj < len; jj++) {
      answerSet[duplicates[ii][jj]] = false;
    }

    var answers = [];
    for (var answer in answerSet) {
      if (answerSet[answer] == true && answer != '') {
        answers.push(answer);
      }
    }

    result.push({
      name: categories[ii],
      answers: answers,
      empty: answers.length == 0
    });
  }
  return result;
};

Template.judgment.letter = function() {
  return game() && game().letter;
}

Template.judgment.events({
  'click .category-answer, tap .category-answer': function(evt) {
    var $target = $(evt.target);
    if ($target.hasClass('rejected')) {
      $target.removeClass('rejected');
    } else {
      $target.addClass('rejected');
    }
  },

  'click #submit-judgment, tap #submit-judgment': function() {
    var rejected = [];
    $('.category').each(function() {
      var r = [];
      $(this).find('.rejected').each(function() {
        r.push($(this).text());
      });
      rejected.push(r);
    });
    Meteor.call('submit_judgment', playerId(), game()._id, rejected);
  }
});

Template.results.helpers({
  glyphicon: function(status) {
    if (status == 'accepted') {
      return 'glyphicon-ok';
    } else if (status == 'duplicate') {
      return 'glyphicon-asterisk'
    } else {
      return 'glyphicon-remove';
    }
  },

  format: function(entry) {
    if (entry == '') {
      return '(Empty)';
    }
    return entry;
  },

  style: function(entry) {
    if (entry == '') {
      return 'empty';
    }
  }
});

Template.results.show = function() {
  return game() && game().state == 'done';
};

Template.results.players = function() {
  var g = game();
  var players = {};
  for (var ii = 0, len = g.submitted.length; ii < len; ii++) {
    var s = g.submitted[ii];
    players[s.player_id] = s;
  }
  for (var ii = 0, len = g.players.length; ii < len; ii++) {
    var p = g.players[ii];
    players[p._id].name = p.name;
  }
  var result = [];
  for (var key in players) {
    result.push(players[key]);
  }
  return result;
};

Template.results.events({
  'click #return-to-lobby, tap #return-to-lobby': function() {
    Players.update(playerId(), {$unset: {game_id: ''}});
  }
});

//////
////// Initialization
//////

Meteor.startup(function() {
  var playerId = Players.insert({name: '',
                                 room: room(),
                                 idle: false,
                                 last_keepalive: (new Date()).getTime()});
  Session.set('player_id', playerId);

  Deps.autorun(function() {
    Meteor.subscribe('players', room());
    var me = player();
    if (me && me.game_id) {
      Meteor.subscribe('games', me.game_id);
    }
  });

  Meteor.setInterval(function() {
    if (Meteor.status().connected)
      Meteor.call('keepalive', playerId);
  }, 20*1000);
});
