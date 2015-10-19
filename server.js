var http = require('http');
var path = require('path');
var express = require('express');
var twilio = require('twilio');
var bodyParser  = require('body-parser');
var httpRequest = require('request');

// Configuration for Twilio account and messaging service instance
var accountSid = process.env.TWILIO_ACCOUNT_SID;
var authToken = process.env.TWILIO_AUTH_TOKEN;

// Your messaging app instance - create this via REST API. Eventually you will
// do this through the portal.
var serviceSid = process.env.TWILIO_IP_SERVICE_SID;

// TaskRouter variables
var workspaceSid = process.env.TWILIO_WORKSPACE_SID;
var workflowSid = process.env.TWILIO_WORKFLOW_SID;

// in memery cache of user worker SIDs
// TODO move to a database
var taskRouterCache = {};

// create TaskRouter Client
var client = new twilio.TaskRouterClient(accountSid, authToken);

// Create Express app
var app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

function addToTaskRouterCache(workerSid, friendlyName) {
    taskRouterCache[workerSid] = taskRouterCache[workerSid] || {};
    taskRouterCache[workerSid] = friendlyName;
}

// Get workerSids at runtime & add to cache
// TODO add a listenr to update with newly created workers
client.workspace.workers.get(null,
    function(err, data) {
        if(!err) {
            data.workers.forEach(function(worker) {
                var friendlyName = worker.friendly_name;
                var workerSid = worker.sid;
                addToTaskRouterCache(workerSid, friendlyName);
                console.log('added', friendlyName, workerSid, 'to cache');
            })
        }
    }
);

// Generate an IP Messaging token
app.get('/token', function(request, response) {
    // A unique identity for this user (like an e-mail or username)
    var identity = request.query.identity;

    // A unique identifier for the device the user is connecting from
    var device = request.query.device;

    // Create a unique endpoint ID - a good path for creating a unique one is
    // serviceSid:device:identity, but it can be any string that uniquely
    // identifies a user of your app on a given device.
    var endpointId = serviceSid + ':' + device + ':' + identity;

    // Generate a capability token we send to the client
    var generator = new twilio.Capability(accountSid, authToken);

    // Note that the TwiML app sid is not used by IP Messaging
    generator.allowClientOutgoing('some random thing that doesnt matter', {
        service_sid: serviceSid,
        endpoint_id: endpointId,
        identity: identity
    });

    // generate string token (JWT) we send to the client
    var tokenExpiresAfterSeconds = 60 * 60 * 12 * 1000; // 12 hours
    var token = generator.generate(tokenExpiresAfterSeconds);

    // Send token to client in a JSON response
    response.send({
        token: token
    });
});

// Generate a TaskRouter token
app.get('/trtoken', function(request, response) {
    // Get the identity
    var identity = request.query.identity;

    // get FriendlyName from local cache
    Object.keys(taskRouterCache).forEach(function(workerSid) {
        if (identity == taskRouterCache[workerSid]) {
            sendToken(workerSid);
        }
    });

    // send token after we recieve workerSid
    function sendToken(workerSid) {
        // Generate a TaskRouter Capability Token
        var generator = new twilio.TaskRouterWorkerCapability(
            accountSid, authToken, workspaceSid, workerSid);

        // set worker permissions
        generator.allowActivityUpdates();
        generator.allowReservationUpdates();

        // generate string token (JWT) we send to the client
        var tokenExpiresAfterSeconds = 60 * 60 * 12 * 1000; // 12 hours
        var token = generator.generate(tokenExpiresAfterSeconds);

        // Send token to client in a JSON response
        response.send({
            token: token
        });
    }
});

// process IP Messaging webhooks
app.post('/hook', function(request, response) {
  var trigger = request.query.trigger;

  // fire when a new channel is created
  if (trigger == 'onChannelAdd') {
    console.log('onChannelAdd fired');
    var channelSid = request.body.ChannelSid;
    var serviceType = JSON.parse(request.body.Attributes).service_type
    createTask(channelSid, serviceType);
  }

  response.sendStatus(200);
});

// Helper Function to create a TaskRouter Task
function createTask(channelSid, serviceType) {
  console.log('Creating Task');
  var attributes = JSON.stringify({
      service_request: serviceType,
      channelSid: channelSid
   });
  client.workspace.tasks.create({
        workflowSid: workflowSid,
        attributes: attributes
    }, function(err, task) {
      if (err) {
        console.log("error creating task", err);
      } else {
        console.log("task_sid: ", task.sid);
        console.log("assignment_status: ", task.assignment_status);
      }
    });
}

// Helper Function to add the Agent Member to the Customer created channel
function addToChannel(identity, channelSid) {
  console.log('adding ' + identity + ' to channel: ' + channelSid)
  // on Reservaction accept add agent to the channel
  var baseUrl = 'https://' + accountSid + ':' + authToken +
    '@ip-messaging.twilio.com/v1/'
  httpRequest.post({
    url: baseUrl + 'Services/' + serviceSid + '/Channels/' + channelSid + '/Members',
    formData: { Identity: identity }
  }, function (error, response, body) {
      if (error) {
        return console.error('ChannelAdd failed:', error);
      }
      console.log('ChannelAdd successful!  Server responded with:', body);
     }
  );
}

// TaskRouter Callback URLs
app.all('/assignment_callback', function(request, response) {
  console.log('POST to /assignment_callback', request.body);

  // add channel
  var channelSid = JSON.parse(request.body.TaskAttributes).channelSid;

  var identity = taskRouterCache[request.body.WorkerSid];

  // add the worker to the channel
  console.log('adding ' + identity + ' to channel: ' + channelSid );
  addToChannel(identity, channelSid);

  // Respond to assignment callbacks with empty 200 response
  response.sendStatus(200)
});

// Events callback on workSpace - I don't think this is the way to do it.
app.all('/taskrouter_events', function(request, response) {
    console.log('POST to /taskrouter_events', request.body);

    var eventType = request.body.EventType;
    switch (eventType) {
        case 'reservation.accepted':
            console.log('reservation.accepted calling addToChannel');
            var channelSid = JSON.parse(request.body.TaskAttributes).channelSid;
            addToChannel(channelSid);
        break;
    }
});


//
//
// START Not Used but helpful for debugging
//
//


// route to test task creation
app.all('/create_task', function(request, response) {
  // Creating a task
  client.workspace.tasks.create({
        workflowSid: workflowSid,
        attributes: '{"service_request":"support"}'
    }, function(err, task) {
      if (err) {
        response.sendStatus(500).json(err);
      } else {
        console.log("task_sid: ", task.sid);
        console.log("assignment_status: ", task.assignment_status);
        response.sendStatus(200);
      }
    });
});

app.all('/accept_reservation', function(request, response) {
  // Accepting a reservation
  var taskSid = request.query.task_sid;
  var reservationSid = request.query.reservation_sid;
  client.workspace.tasks(taskSid)
                          .reservations(reservationSid)
                          .update({
                            reservationStatus: 'accepted'
    }, function(err, reservation) {
      if (err) {
        response.sendStatus(500).json(err);
      } else {
         console.log(reservation.reservation_status);
         console.log(reservation.worker_name);
         response.sendStatus(200);
       }
    });
});

//
//
// END Not Used but helpful for debugging
//
//

// Start and mount express app
var port = process.env.PORT || 3000;
http.createServer(app).listen(port, function() {
    console.log('Express server started on *:' + port);
});
