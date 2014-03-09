////////// Server only logic //////////

diceLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'R', 'S', 'T', 'W'];
categories = [];
timer = 120;

var setGameInterval = function(gameId) {
  var game = Games.findOne(gameId);

  // wind down the game clock
  var clock = game.clock;
  var ready_clock = game.ready_clock;
  var interval = Meteor.setInterval(function () {
      if (ready_clock > 0) {
        ready_clock -= 1;
      } else {
        clock -= 1;
      }
      Games.update(gameId, {$set: {clock: clock, ready_clock: ready_clock}});

      // end of game
      if (clock == -5) {
        // stop the clock
        Meteor.clearInterval(interval);
        var game = Games.findOne(gameId);
        if (game.state == 'active') {
          force_judgment(game);
        }
      }
    }, 1000);
}

Meteor.methods({
  start_new_game: function (room) {
    // create a new game w/ fresh board
    var gameId = Games.insert({categories: new_board(),
                               letter: new_letter(),
                               submitted: [],
                               judgments: [],
                               players: [],
                               state: 'active',
                               clock: timer,
                               ready_clock: 3
                             });

    Players.update({game_id: null, name: {$ne: ''}, room: room, idle: false},
                   {$set: {game_id: gameId}},
                   {multi: true});

    var players = Players.find({game_id: gameId},
                               {fields: {_id: true, name: true}}).fetch();
    Games.update({_id: gameId}, {$set: {players: players}});

    setGameInterval(gameId);
    return gameId;
  },

  submit_answers: function(playerId, gameId, answers) {
    var game = Games.findOne(gameId);
    var submittedAnswers = game.submitted;
    var submitted = false;
    for (var ii = 0, len = submittedAnswers.length; ii < len; ii++) {
      if (submittedAnswers[ii].player_id == playerId) {
        submitted = true;
        break;
      }
    }
    if (!submitted) {
      add_answers(playerId, gameId, answers);
    }
  },

  submit_judgment: function(playerId, gameId, rejected) {
    var game = Games.findOne(gameId);
    var judgments = game.judgments;
    var judged = false;
    for (var ii = 0, len = judgments.length; ii < len; ii++) {
      if (judgments[ii].player_id == playerId) {
        judged = true;
        break;
      }
    }
    if (!judged) {
      add_judgment(playerId, gameId, rejected);
    }
  },

  keepalive: function (player_id) {
    check(player_id, String);
    Players.update(player_id,
                  {$set: {last_keepalive: (new Date()).getTime(),
                          idle: false}});
  }
});

Meteor.setInterval(function () {
  var now = (new Date()).getTime();
  var idle_threshold = now - 30*1000; // 30 sec
  var remove_threshold = now - 60*60*1000; // 1 hr
  var judgment_theshold = now - 2*60*1000; // 2 min

  var players = Players.find({last_keepalive: {$lt: idle_threshold}, game_id: {$exists: true}}).fetch();
  for (var ii = 0, len = players.length; ii < len; ii++) {
    var game = Games.findOne(players[ii].game_id);
    if (game) {
      force_player(game, players[ii]._id);
    }
  }
  Players.update({last_keepalive: {$lt: idle_threshold}},
                 {$set: {idle: true}, $unset: {game_id: ''}},
                 {multi: true});

  var games = Games.find({judgment_start: {$lt: judgment_theshold}, state: 'judgment'}).fetch();
  for (var ii = 0, len = games.length; ii < len; ii++) {
    force_result(games[ii]);
  }

  // XXX need to deal with people coming back!
  Players.remove({last_keepalive: {$lt: remove_threshold}});
  Games.remove({judgment_start: {$lt: remove_threshold}});
}, 30*1000);

Meteor.startup(function () {
  categories = JSON.parse(Assets.getText('categories.json'));
  var activeGames = Games.find({state: 'active'}).fetch();
  for (var ii = 0, len = activeGames.length; ii < len; ii++) {
    setGameInterval(activeGames[ii]._id);
  }
});