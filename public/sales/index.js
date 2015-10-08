// Global references to key objects
var messagingClient; // handle for Twilio.IPMessaging.Client instance
var currentChannel; // handle for the current Twilio.IPMessaging.Channel
var channels = {}; // currently connected channels
var identity; // the current user's unique ID, like an e-mail or username
var channelCache = {} // Local cache of messages for each channel


// helpers to update chat area with messages
function append(html, clear) {
    var $messages = $('#messages');
    if (clear) {
        $messages.html(html);
    } else {
        $messages.append(html);
    }
    $messages.animate({
        scrollTop: $messages[0].scrollHeight
    }, 200);
}
function info(msg) {
    var clean = DOMPurify.sanitize(msg);
    var m = '<div class="info">' + clean + '</div>';
    append(m);
}
function error(msg) {
    var clean = DOMPurify.sanitize(msg);
    var m = '<div class="info" style="color:red;">' + clean + '</div>';
    append(m);
}
function chat(sid, user, msg) {
    var cleanUser = DOMPurify.sanitize(user);
    var cleanMessage = DOMPurify.sanitize(msg);
    var m = '<div class="chat"><span>' + cleanUser + ': </span>'
        + cleanMessage + '</div>';
    if (sid === currentChannel.sid) { append(m); } // add to active box
    channelCache[sid] += m; // add to cache
}

// Make a given channel the currently selected channel
function makeCurrent(channel) {
    currentChannel = channel;
    $('select').val(channel.sid);
    $('#messages').html(channelCache[channel.sid])
    $("#messages").scrollTop($("#messages")[0].scrollHeight);
}

// Configure event callbacks on a messaging client
function configureClient(messagingClient) {

    // Listen for incoming channel invitations
    messagingClient.on('channelInvited', function(channel) {
        var confMessage = 'You have been invited to "' + channel.friendlyName
            + '". Will you join?';
        var joinChannel = confirm(confMessage);

        // Bail if they decide not to join
        if (!joinChannel) return;

        // Otherwise, set up the channel
        configureChannel(channel);
        makeCurrent(channel);
        channel.join();
    });
}

// Configure UI and event callbacks for a channel
function configureChannel(channel) {
    // Add to master list of channels
    channels[channel.sid] = channel;

    // Add channel to dropdown
    var option = '<option value="' + channel.sid + '">'
        + channel.friendlyName + '</option>';
    $('select').append(option);

    // initiate channel in local cache
    channelCache[channel.sid] = ""

    // fetch chat history
    // NOTE calling fetchMessages() is needed to force messageAdded events to
    // start firing due to known bug
    channel.fetchMessages(25).then(function (messages) {
        for (msg in messages) {
            chat(channel.sid, messages[msg].author, messages[msg].body)
        }
    })

    // TODO add buddy list for channels
    channel.fetchMembers();

    // Set up listener for new messages on channel
    channel.on('messageAdded', function(message) {
        // add message to the chat box
        chat(channel.sid, message.author, message.body);
    });

    // Listen for new members
    channel.on('memberJoined', function(m) {
        info(m.identity + ' joined ' + channel.friendlyName);
    });
}

// Initialize application on window load
$(function() {
    // Prompt for identity of the current user - not checked for uniqueness
    // in this demo. IRL you would probably use a logged in user's username
    // or e-mail address.
    identity = prompt('Please enter a your name:', 'Customer A').trim();

    // After identity entered, fetch capability token from server
    $.getJSON('/token', {
        identity: identity,
        device: 'browser' // Ideally, this would be a unique device ID
    }, function(data) {
        // Initialize Twilio IP Messaging Client
        messagingClient = new Twilio.IPMessaging.Client(data.token);
        info('Signed in as "' + identity + '".');
        configureClient(messagingClient);

        // Create a default channel
        messagingClient.createChannel({
            friendlyName: identity + "'s Channel"
        }).then(function(channel) {
            // Join the channel
            channel.join();

            // add channel to currently connected channels and make it the
            // current one
            configureChannel(channel);
            makeCurrent(channel);
        });
    });

    // Post new chat message
    $('form').on('submit', function(e) {
        e.preventDefault();
        var msg = $('input').val();
        $('input').val('');
        currentChannel.sendMessage(msg);
    });

    // Invite another user to the current channel
    $('button').on('click', function(e) {
        var newUser = prompt('Invite which user?', 'natasha').trim();
        currentChannel.invite(newUser);
    });

    // Switch between active chats
    $('select').on('change', function(e) {
        var newValue = $(e.currentTarget).val();
        makeCurrent(channels[newValue]);
    });
});
