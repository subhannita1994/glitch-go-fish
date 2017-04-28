define(function(require) {
  var $ = require("jquery");
  var io = require("io");
  var _bootstrap = require("bootstrap");
  var gofish = require("./gofish");
  var Mustache = require("mustache");
  $(function() {
    var FADE_TIME = 150;
    var TYPING_TIMER_LENGTH = 400;
    var COLORS = [ 
      "#58dc00", "#287b00", "#a8f07a", "#4ae8c4",
      "#3b88eb", "#3824aa", "#a700ff", "#d300e7",
      "#e21400", "#91580f", "#f8a700", "#f78b00"
    ];
    var $window = $(window);
    var $usernameInput = $(".usernameInput");
    var $messagesDiv = $("#messages-div");
    var $cardsDropdown = $("#cards-dropdown");
    var $ranksDropdown = $("#ranks-dropdown");
    var $cardModals = $("#card-modals");
    var $rankModals = $("#rank-modals");
    var $messages = $(".messages");
    var $inputMessage = $(".inputMessage");
    var $loginModal = $("#login-modal");
    var $chatPage = $("#chat-page");
    var $userList = $("#user-list");
    var cardDropdownTemplate = $("#card-dropdown-template").html();
    var rankDropdownTemplate = $("#rank-dropdown-template").html();
    var cardModalTemplate = $("#card-modal-template").html();
    var rankModalTemplate = $("#rank-modal-template").html();
    var scoreTemplate = $("#score-template").html();    
    var userTemplate = $("#user-template").html();
    var playBarTemplate = $("#play-bar-template").html();
    var GameOvTemplate = $("#play-bar-template").html();
    var username = "";
    var users = [];
    var free_ranks = [];
    var usermap = {};
    var turn = null;
    var $usermap = {};
    var typingmap = {};
    var connected = false;
    var typing = false;
    var lastTypingTime;
    var $currentInput = $usernameInput.focus();
    var socket = io();

    $.getJSON("/deck.json", function(data) {
      socket.deck = new gofish.CardDeck(data);
    });
    
    function updateGame(data) {
      if (data) {
        users = data.game.users;
        usermap = {};
        users.forEach(function(u) { usermap[u.name] = u; });
        turn = data.game.turn;
        $('#pile-size').text(data.game.pile_size);
      }
      
      $('#username-brand').html(username+'&nbsp;');

      $("#bottom-bar").removeClass('nav-inverse');
      $("#play-bar").empty();
      if (turn===null) {
        $('#game-status').html('Waiting for players');
      }
      if (turn!==null) {
        $('#game-status').html(turn+"'s turn");
        if (turn===username) { // our turn
          var rankmap = {};
          socket.deck.ranks.forEach(function(r) {
            rankmap[r.name] = r;
          });
          users.forEach(function(u) {
            u.ranks.forEach(function(rank) {
              delete rankmap[rank.name];
            });
          });
          
          var free_ranks = socket.deck.ranks.filter(function (r) {            
            return r.name in rankmap;
          });

          $('#game-status').html("<strong>your</strong> turn");
          $('#username-brand').append(
            $('<span class="glyphicon glyphicon-hand-right" aria-hidden="true"></span>'));
          $("#play-bar").html(
            Mustache.render(
              playBarTemplate, {
                who: users.filter(function(u) {
                  return u.hand_size>0 && u.name!==username; }),
                ranks: free_ranks,
                suits: socket.deck.suits
              }
            )
          );
          $('.drop-select').click(function() {
            $($(this).data('target'))
                .text($(this).data('value'))
                .data('done', true);
             $('#ask-button').prop(
               'disabled',
               !($('#play-with-field').data('done') &&
                 $('#play-rank-field').data('done') &&
                 $('#play-suit-field').data('done')));
          });
          $('#ask-button').click(function() {
            socket.emit(
              "ask", {
                from: $('#play-with-field').text(),
                rank: $('#play-rank-field').text(),
                suit: $('#play-suit-field').text()
            });            
            $(this).prop('disabled',true);
            // give phones feedback that something
            // happened (menu might hide entire display)
            $('.collapse').collapse('hide');
            log(Mustache.render(
              "You ask {{{u}}} for {{r}} of {{s}}...", {
                u: $('#play-with-field').text(),
                r: $('#play-rank-field').text(),
                s: $('#play-suit-field').text()
            }));
          });
        }
      }
      $usermap = {};
      users.forEach(function(user) {
        $usermap[user.name] = $("<li/>")
          .addClass("list-group-item");
        updateUser(user);
      });
      $userList.empty();
      users.forEach(function(user) {
        $userList.append($usermap[user.name]);
      });
    }
    function updateUser(user) {
      var $user = $usermap[user.name];
      if (!$user) {
        return;
      }
      $user.html(Mustache.render(userTemplate, {
        user: user,
        typing: typingmap[user.name],
        playing: turn!==null && turn===user.name,
        me: user.name === username
      }));
    }
    function updateHand(socket) {
      $cardsDropdown.empty();
      if (socket.hand.cards.length) {
        $cardsDropdown.append(
          $(Mustache.render(cardDropdownTemplate, {cards: socket.hand.cards})));
      }
      $ranksDropdown.empty();
      var user = usermap[socket.username];
      if (user && user.ranks.length) {
        $ranksDropdown.append(
          $(Mustache.render(rankDropdownTemplate, {ranks: user.ranks})));
      }
      $cardModals.empty();
      socket.hand.cards.forEach(function(card) {
        $cardModals.append(
          $(Mustache.render(cardModalTemplate, card)));
      });
      $rankModals.empty();
      usermap[username].ranks.forEach(function(rank) {
        $rankModals.append(
          $(Mustache.render(rankModalTemplate, rank)));
      });
      updateGame();
    }
    function setUsername() {
      username = $usernameInput.val().trim().toLowerCase();
      if (username) {
        $loginModal.modal("hide");
        $currentInput = $inputMessage.removeAttr("disabled").val("").attr("placeholder", "chat here...");
        socket.emit("join", username);
      }
    }
    function sendMessage() {
      var message = $inputMessage.val().trim();
      if (message && connected) {
        $inputMessage.val("");
        addChatMessage(
          // Didn't come from server, so we're not re-sanitizing (&amp;-ing)
          { username: username, message: message },
          { sanitize: true }
        );
        socket.emit("new message", message);
      }
    }
    function log(message, options) {
      var $el = $("<li>").addClass("log").html(message);
      addMessageElement($el, options);
    }
    function addChatMessage(data, options) {
      var $username = $('<span class="username"/>').html(data.username).css("color", getUsernameColor(data.username));
      var $messageBody = $("<span/>").addClass("messaegBody");
      if (options && options.sanitize) {
        $messageBody.text(data.message);
      } else {
        $messageBody.html(data.message);
      }
      var typingClass = data.typing ? "typing" : "";
      var $message = $('<li class="message"/>').data("username", data.username)
        .addClass(typingClass).append($username, $messageBody);
      addMessageElement($message, options);
    }
    function addChatTyping(data) {
      typingmap[data.username] = true;
      updateUser(data.username);
    }
    function removeChatTyping(data) {
      delete typingmap[data.username];
      updateUser(data.username);
    }
    function addMessageElement(el, options) {
      var $el = $(el);
      if (!options) {
        options = {};
      }
      if (typeof options.fade === "undefined") {
        options.fade = true;
      }
      if (typeof options.prepend === "undefined") {
        options.prepend = false;
      }
      if (options.fade) {
        $el.hide().fadeIn(FADE_TIME);
      }
      if (options.prepend) {
        $messages.prepend($el);
      } else {
        $messages.append($el);
      }
      $messagesDiv.animate({
        scrollTop: $messagesDiv.prop("scrollHeight") - $messagesDiv.height()
      }, 500);
    }
    function updateTyping() {
      if (connected) {
        if (!typing) {
          typing = true;
          socket.emit("typing");
        }
        lastTypingTime = new Date().getTime();
        setTimeout(function() {
          var typingTimer = new Date().getTime();
          var timeDiff = typingTimer - lastTypingTime;
          if (timeDiff >= TYPING_TIMER_LENGTH && typing) {
            socket.emit("stop typing");
            typing = false;
          }
        }, TYPING_TIMER_LENGTH);
      }
    }
    function getUsernameColor(username) {
      var hash = 7;
      for (var i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + (hash << 5) - hash;
      }
      var index = Math.abs(hash % COLORS.length);
      return COLORS[index];
    }
    $window.keydown(function(event) {
      if (!(event.ctrlKey || event.metaKey || event.altKey)) {
        $currentInput.focus();
      }
      if (event.which === 13) {
        if (username) {
          sendMessage();
          socket.emit("stop typing");
          typing = false;
        } else {
          setUsername();
        }
      }
    });
    $inputMessage.on("input", function() {
      updateTyping();
    });
    $loginModal.click(function() {
      $currentInput.focus().select();
    });
    $('#messages-div').click(function() {
      $inputMessage.focus();
    });
    socket.on("connect", function() {
      // nothing so far
    });
    socket.on("disconnect", function() {
      alert('Disconnectd 😟');
      document.location.reload();
    });

    socket.on("joined", function(data) {
      socket.username = data.username;
      socket.hand = new gofish.CardHand(socket.deck);
      connected = true;
      var message = "Welcome, "+data.username;
      log(message, {
        prepend: true
      });
      updateGame(data);
    });
    socket.on("username taken", function(data) {
      username = "";
      $currentInput = $usernameInput.focus().val("")
        .attr("placeholder",
              "Sorry, " + data.username + " is taken.");
      $loginModal.modal("show");
    });
    socket.on("new message", function(data) {
      addChatMessage(data);
    });
    socket.on("status", function(data) {
      log(data.message);
      updateGame(data);
    });
    socket.on("game over", function(data) {
      socket.hand.clear();
      updateGame(data);
      var score_html = Mustache.render(
        scoreTemplate, data);
      log('Game over. Refresh browser to play again.');
      log(score_html);
      
      $('#score').html(score_html);
      $('#game-over-modal').modal('show');
    });
    socket.on("take", function(data) {
      var card = socket.hand.deck.getCard(
        data.rank, data.suit);
      if (!card) {
        console.log("can't take card: "+JSON.stringify(data));
        return;
      }
      socket.hand.take(card);
      var pr=socket.hand.pull_rank();
      if (pr) {
        // ugly patch to update menu before next status
        usermap[socket.username].ranks.push(pr);
      }
      updateHand(socket);
    });
    socket.on("give", function(data) {
      var index = socket.hand.cards.findIndex(function(c) {
        return c.rank==data.rank && c.suit==data.suit;
      });
      if (index<0) {
        console.log("can't give card: "+JSON.stringify(data));
        return;
      }
      socket.hand.cards.splice(index,1);
      updateHand(socket);
      // No need. Recipient gets the broadcast in third person ;)
      // if (data.to) {
      //   log(Mustache.render(
      //   "you give {{rank}} of {{suit}} to {{{to}}}", data));
      // }
    });
    
    socket.on("user joined", function(data) {
      log(data.username + " joins");
      updateGame(data);
    });
    socket.on("user left", function(data) {
      log(data.username + " leaves");
      updateGame(data);
    });
    socket.on("typing", function(data) {
      addChatTyping(data);
    });
    socket.on("stop typing", function(data) {
      removeChatTyping(data);
    });
    $loginModal.on("hidden.bs.modal", function(e) {
      if (!username) $loginModal.modal("show");
    });
    $loginModal.modal("show");
  });
});
