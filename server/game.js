////////// Server only logic //////////

diceLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'R', 'S', 'T', 'W'];
categories = [];
timer = 120;

var setGameInterval = function(gameId) {
  var game = Games.findOne(gameId),
      clock = game.clock,
      readyClock = game.ready_clock;

  var interval = Meteor.setInterval(function () {
    if (readyClock > 0) {
      readyClock -= 1;
    } else {
      clock -= 1;
    }

    Games.update(gameId, {$set: {clock: clock, ready_clock: readyClock}});

    // end of game
    if (clock == -5) {
      var game = Games.findOne(gameId);

      // stop the clock
      Meteor.clearInterval(interval);

      if (game.state == 'active') {
        forceJudgment(game);
      }
    }
  }, 1000);
}

Meteor.methods({
  startNewGame: function (room) {
    // create a new game w/ fresh board
    var gameId = Games.insert({categories: newBoard(),
                               letter: newLetter(),
                               submitted: [],
                               judgments: [],
                               players: [],
                               state: 'active',
                               clock: timer,
                               ready_clock: 3});

    Players.update({game_id: null, name: {$ne: ''}, room: room, idle: false},
                   {$set: {game_id: gameId}},
                   {multi: true});

    var players = Players.find({game_id: gameId},
                               {fields: {_id: true, name: true}}).fetch();

    Games.update({_id: gameId}, {$set: {players: players}});
    setGameInterval(gameId);
    return gameId;
  },

  submitAnswers: function(playerId, gameId, answers) {
    var game = Games.findOne(gameId),
        submittedAnswers = game.submitted,
        submitted = false;

    for (var ii = 0, len = submittedAnswers.length; ii < len; ii++) {
      if (submittedAnswers[ii].player_id == playerId) {
        submitted = true;
        break;
      }
    }

    if (!submitted) {
      addAnswers(playerId, gameId, answers);
    }
  },

  submitJudgment: function(playerId, gameId, rejected) {
    var game = Games.findOne(gameId),
        judgments = game.judgments,
        judged = false;

    for (var ii = 0, len = judgments.length; ii < len; ii++) {
      if (judgments[ii].player_id == playerId) {
        judged = true;
        break;
      }
    }

    if (!judged) {
      addJudgment(playerId, gameId, rejected);
    }
  },

  keepAlive: function (player_id) {
    check(player_id, String);
    Players.update(player_id,
                  {$set: {last_keepalive: (new Date()).getTime(),
                          idle: false}});
  }
});

Meteor.setInterval(function () {
  var now = (new Date()).getTime(),
      idleThreshold = now - 30*1000, // 30 sec
      removeThreshold = now - 60*60*1000, // 1 hr
      judgmentTheshold = now - 3*60*1000, // 2 min
      games = Games.find({judgment_start: {$lt: judgmentTheshold}, state: 'judgment'}).fetch();

  Players.update({last_keepalive: {$lt: idleThreshold}},
                 {$set: {idle: true}},
                 {multi: true});

  for (var ii = 0, len = games.length; ii < len; ii++) {
    forceResult(games[ii]);
  }

  // XXX need to deal with people coming back!
  Players.remove({last_keepalive: {$lt: removeThreshold}});
  Games.remove({judgment_start: {$lt: removeThreshold}});
}, 30*1000);

Meteor.startup(function () {
  var activeGames = Games.find({state: 'active'}).fetch();

  categories = JSON.parse(Assets.getText('categories.json'));
  
  for (var ii = 0, len = activeGames.length; ii < len; ii++) {
    setGameInterval(activeGames[ii]._id);
  }
});
