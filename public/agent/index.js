// Global references to key objects
var messagingClient; // handle for Twilio.IPMessaging.Client instance
var currentChannel; // handle for the current Twilio.IPMessaging.Channel
var channelCache = {} // Local cache of processed messages for each channel
var worker; // handle for Twilio.TaskRouter.Worker instance

// helpers to update chat area with messages
function append(html) {
    var $messages = $('#messages');
    $messages.append(html);
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
    //remove highlight from previous active channel
    if (currentChannel) {
        $('#' + currentChannel.sid).removeClass('activeChannel');
    }
    // Set new currentChannel
    currentChannel = channel;
    // add highlight
    $('#' + currentChannel.sid).addClass('activeChannel')
    // Update messages panel
    $('#messages').html(channelCache[channel.sid])
    $("#messages").scrollTop($("#messages")[0].scrollHeight);
}

// Configure event callbacks on a messaging client
function configureClient(messagingClient) {
    // TODO setup previous state from last time agent logged in

    // listener for when the agent is added to a channel
    messagingClient.on('channelJoined', function(channel) {
        console.log('channelJoined', channel);
        configureChannel(channel);
        makeCurrent(channel);
    });
}

// Configure UI and event callbacks for a channel
function configureChannel(channel) {
    // Add channel to sidebar
    var div = '<div id="' + channel.sid + '" class="channel">'
    + channel.friendlyName + '</div>';
    $('#channels').append(div);

    // setup a click listener
    $('#' + channel.sid).on('click', function(e) {
        console.log('you clicked', $(this).html());
        console.log('channel', channel);
        makeCurrent(channel);
    });

    // initiate channel in local cache
    channelCache[channel.sid] = ""

    // populate chat history
    channel.fetchMessages(25).then(function (messages) {
        for (msg in messages) {
            chat(channel.sid, messages[msg].author, messages[msg].body)
        }
    });

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

// helpers for taskrouter

function updateActivity(worker) {
    console.log("worker.activityName", worker.activityName);
    console.log("worker.activitySid", worker.activitySid);
    console.log("worker.available", worker.available);
    $('#activity').val(worker.activitySid);
    if (worker.available) {
        $('#available').removeClass('red').addClass('green')
    } else {
        $('#available').removeClass('green').addClass('red')
    }
}

function configureWorker(worker) {
    // configure activities dropdown
    worker.activities.fetch(
        function(error, activityList) {
            if(error) {
                console.log(error); return;
            } else {
                var data = activityList.data;
                for(i=0; i<data.length; i++) {
                    var option = '<option value="' + data[i].sid + '">'
                    + data[i].friendlyName + '</option>';
                    $('#activity').append(option);
                }
            }
        }
    );

    // set dropdown to existing activity
    worker.on("ready", function(worker) {
        updateActivity(worker);
    });

    // Set up listener for activity updates
    worker.on("activity.update", function(worker) {
        updateActivity(worker);
    });

    // Set up listener for reservations
    worker.on("reservation.created", function(reservation) {
        var answer = confirm('New Reso - accept?');
        if (answer) {
            reservation.accept();
        } else {
            reservation.reject();
            // TODO leave the channel
        }
    });
}

// Initialize application on window load
$(function() {
    // Prompt for identity of the current user - not checked for uniqueness
    // in this demo. IRL you would probably use a logged in user's username
    // or e-mail address.
    var identity = prompt('Please enter a username:', 'Bob').trim();

    // After identity entered, fetch capability token from server
    $.getJSON('/token', {
        identity: identity,
        device: 'browser' // Ideally, this would be a unique device ID
    }, function(data) {
        // Initialize Twilio IP Messaging Client
        messagingClient = new Twilio.IPMessaging.Client(data.token);
        info('Signed in as "' + identity + '".');
        configureClient(messagingClient);
    });

    // fetch TaskRouter capability token from server
    $.getJSON('/trtoken', {
        identity : identity
    }, function(data) {
        // Initialize Twilio TaskRouter Client
        worker = new Twilio.TaskRouter.Worker(data.token);
        configureWorker(worker);
    });

    // Post new chat message
    $('form').on('submit', function(e) {
        e.preventDefault();
        var msg = $('input').val();
        $('input').val('');
        currentChannel.sendMessage(msg);
    });

    // TODO setup available button
    $('#ready').on('click', function(e) {
        console.log('you clicked', $(this).html());
    });

    // Change activity via dropdown
    $('#activity').on('change', function(e) {
        var newValue = $(e.currentTarget).val();
        console.log($(e.currentTarget).val());
        worker.update("ActivitySid", newValue)
    });
});
