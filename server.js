var http = require('http');
var path = require('path');
var express = require('express');
var twilio = require('twilio');
var bodyParser  = require('body-parser');
var httpRequest = require('request');

// Create Express app
var app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

// Configuration for Twilio account and messaging service instance
var accountSid = process.env.TWILIO_ACCOUNT_SID;
var authToken = process.env.TWILIO_AUTH_TOKEN;

// Your messaging app instance - create this via REST API. Eventually you will
// do this through the portal.
var serviceSid = process.env.TWILIO_IP_SERVICE_SID;

// TaskRouter variables
var workspaceSid = process.env.TWILIO_WORKSPACE_SID;
var workflowSid = process.env.TWILIO_WORKFLOW_SID;

// create TaskRouter Client
var client = new twilio.TaskRouterClient(accountSid, authToken);

// poor man's db
var db = { 'Alice' : 'WK93f03f04181b416eba8b398b3c0f8b25',
           'Bob' : 'WK3baf910df53787b8a3647c2f5c066db4'
} // mapping of IP Messaging endpointId to TaskRouter workerSid

var channelSid;

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
    // Get the Worker SID
    var workerSid = request.query.worker_sid;

    // Generate a TaskRouter Capability Token
    var generator = new twilio.TaskRouterWorkerCapability(accountSid,
                                                          authToken,
                                                          workspaceSid,
                                                          workerSid);
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
});

app.post('/hook', function(request, response) {
  var trigger = request.query.trigger;

  if (trigger == 'onChannelAdd') {
    console.log('onChannelAdd fired');
    console.log('TRSID: ', db['Alice']);
    channelSid = request.body.ChannelSid;
    console.log('channelSid', channelSid);

    // Make Reservation
  }

  response.sendStatus(200);

  addToChannel(channelSid);
});

function addToChannel(channelSid) {
  console.log('adding to channel: ', channelSid)
  // on Reservaction accept add agent to the channel
  var baseUrl = 'https://' + accountSid + ':' + authToken +
    '@ip-messaging.twilio.com/v1/'
  httpRequest.post({
    url: baseUrl + 'Services/' + serviceSid + '/Channels/' + channelSid + '/Members',
    formData: { Identity: 'Alice' }
  }, function (error, response, body) {
      if (error) {
        return console.error('upload failed:', error);
      }
      console.log('Upload successful!  Server responded with:', body);
     }
  );
}


// TaskRouter Callback URLs
app.all('/assignment_callback', function(request, response) {
  console.log('we got a body: ', request.body);
  /*
  // log request body
  var bodyStr = '';
  request.on("data",function(chunk){
      bodyStr += chunk.toString();
  });
  request.on("end",function(){
      console.log(bodyStr.split('&'));
  });
  */

  // Respond to assignment callbacks with empty 200 response
  response.sendStatus(200);
});

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

// Start and mount express app
var port = process.env.PORT || 3000;
http.createServer(app).listen(port, function() {
    console.log('Express server started on *:' + port);
});
