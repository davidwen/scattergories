////////// Shared code (client and server) //////////

Players = new Meteor.Collection('players');
// {name: 'David', game_id: ...}

Games = new Meteor.Collection('games');
// {categories: [...], clock: 180}

new_board = function() {
  var categorySet = {};
  var numCategories = categories.length;
  var count = 0;
  while (count < 12) {
    var index = Math.floor(Math.random() * numCategories);
    var category = categories[index];
    if (!categorySet[category]) {
      categorySet[category] = true;
      count++;
    }
  }
  var result = [];
  for (var category in categorySet) {
    result.push(category);
  }
  return result;
};

new_letter = function() {
  return diceLetters[Math.floor(Math.random() * 20)];
};

add_answers = function(playerId, gameId, answers) {
  var normalizedAnswers = [];
  for (var ii = 0; ii < 12; ii++) {
    normalizedAnswers.push({entry: answers[ii].trim().toLowerCase()});
  }
  Games.update(
    gameId,
    { $push: { submitted: { player_id: playerId, answers: normalizedAnswers }}}
  );
  game = Games.findOne(gameId);
  if (game.players.length == game.submitted.length) {
    var duplicateAnswers = compute_duplicate_answers(game);
    Games.update(gameId, {$set: {state: 'judgment',
                                 duplicates: duplicateAnswers,
                                 judgment_start: (new Date()).getTime()}});
  }
};

add_judgment = function(playerId, gameId, rejected) {
  Games.update(
    gameId,
    { $push: { judgments: { player_id: playerId, rejected: rejected }}}
  );
  game = Games.findOne(gameId);
  if (game.players.length == game.judgments.length) {
    var rejectedAnswers = compute_rejected_answers(game);
    var submitted = compute_scores(game, rejectedAnswers);
    Games.update(gameId, {$set: {state: 'done', rejected: rejectedAnswers, submitted: submitted }});
  }
};

compute_duplicate_answers = function(game) {
  var submitted = game.submitted;
  var result = [];
  for (var ii = 0; ii < 12; ii++) {
    var answerSet = {};
    for (var jj = 0, len = submitted.length; jj < len; jj++) {
      var answer = submitted[jj].answers[ii].entry;
      if (answer.trim() == '') {
        continue;
      }
      if (answerSet[answer] == true) {
        answerSet[answer] = false;
      } else if (answerSet[answer] == null) {
        answerSet[answer] = true;
      }
    }

    var duplicates = [];
    for (var answer in answerSet) {
      if (answerSet[answer] == false) {
        duplicates.push(answer);
      }
    }

    result.push(duplicates);
  }
  return result;
};

compute_rejected_answers = function(game) {
  var threshold = Math.ceil(game.players.length / 2);
  var result = [];
  for (var ii = 0; ii < 12; ii++) {
    var counts = {};
    for (var jj = 0, len = game.judgments.length; jj < len; jj++) {
      var judgment = game.judgments[jj];
      for (var kk = 0, len2 = judgment.rejected[ii].length; kk < len2; kk++) {
        var answer = judgment.rejected[ii][kk];
        if (counts[answer] == null) {
          counts[answer] = 1;
        } else {
          counts[answer] = counts[answer] + 1;
        }
      }
    }
    var rejected = [];
    for (var answer in counts) {
      if (counts[answer] >= threshold) {
        rejected.push(answer);
      }
    }
    result.push(rejected);
  }
  return result;
};

compute_scores = function(game, rejected_answers) {
  var submitted = game.submitted;
  var duplicates = game.duplicates;
  var numPlayers = game.submitted.length;
  var categories = game.categories;
  for (var ii = 0; ii < 12; ii++) {
    var rejectedSet = to_set(rejected_answers[ii]);
    var duplicateSet = to_set(duplicates[ii]);
    for (var jj = 0; jj < numPlayers; jj++) {
      var s = submitted[jj];
      if (s.score == null) {
        s.score = 0;
      }
      var answer = s.answers[ii];
      answer.category = categories[ii];
      if (answer.entry == '' || rejectedSet[answer.entry]) {
        answer.status = 'rejected';
      } else if (duplicateSet[answer.entry]) {
        answer.status = 'duplicate';
      } else {
        s.score++;
        answer.status = 'accepted';
      }
    }
  }
  return submitted;
};

force_judgment = function(game) {
  if (game.players.length > game.submitted.length) {
    var missingPlayers = missing_players(game, game.submitted);
    var emptyAnswers = [];
    for (var ii = 0; ii < 12; ii++) {
      emptyAnswers.push('');
    }
    for (var ii = 0, len = missingPlayers.length; ii < len; ii++) {
      add_answers(missingPlayers[ii], game._id, emptyAnswers);
    }
  }
};

force_result = function(game) {
  if (game.players.length > game.judgments.length) {
    var missingPlayers = missing_players(game, game.judgments);
    var emptyRejections = [];
    for (var ii = 0; ii < 12; ii++) {
      emptyRejections.push('');
    }
    for (var ii = 0, len = missingPlayers.length; ii < len; ii++) {
      add_judgment(missingPlayers[ii], game._id, emptyRejections);
    }
  }
};

force_player = function(game, playerId) {
  var submitted = false;
  for (var ii = 0, len = game.submitted.length; ii < len; ii++) {
    if (game.submitted[ii].player_id == playerId) {
      submitted = true;
      break;
    }
  }
  if (!submitted) {
    var emptyAnswers = [];
    for (var ii = 0; ii < 12; ii++) {
      emptyAnswers.push('');
    }
    add_answers(playerId, game._id, emptyAnswers);
  }
  
  var judged = false;
  for (var ii = 0, len = game.judgments.length; ii < len; ii++) {
    if (game.judgments[ii].player_id == playerId) {
      judged = true;
      break;
    }
  }
  if (!judged) {
    var emptyRejections = [];
    for (var ii = 0; ii < 12; ii++) {
      emptyRejections.push('');
    }
    add_judgment(playerId, game._id, emptyRejections);
  }
}

missing_players = function(game, list) {
  var allPlayers = {};
  for (var ii = 0, len = game.players.length; ii < len; ii++) {
    allPlayers[game.players[ii]._id] = true;
  }
  for (var ii = 0, len = list.length; ii < len; ii++) {
    allPlayers[list[ii].player_id] = false;
  }
  var missingPlayers = [];
  for (var playerId in allPlayers) {
    if (allPlayers[playerId]) {
      missingPlayers.push(playerId);
    }
  }
  return missingPlayers;
}

to_set = function(list) {
  var set = {};
  for (var ii = 0, len = list.length; ii < len; ii++) {
    set[list[ii]] = true;
  }
  return set;
}

if (Meteor.isServer) {
  // publish single games
  Meteor.publish('games', function(gameId) {
    return Games.find({_id: gameId});
  });

  Meteor.publish('players', function(room) {
    return Players.find({room: room});
  });
}