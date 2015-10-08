# IP Messaging Hack Day Demo

This example application is a simple demonstration of what's currently possible
with the IP Messaging SDK.

[Launch the Viewsaurus tutorial for this app to learn how it works](https://code.hq.twilio.com/pages/kwhinnery/ipdemo/)!

## Running the app locally

Ensure [Node.js and npm are installed](https://nodejs.org/) on your system, and
clone this app on your machine.  Enter the app directory and do:

```
npm install
```

...which should install all the app's dependencies.  Next, ensure your Twilio
account credentials are present as system environment variables:

```
export TWILIO_ACCOUNT_SID = ACxxx
export TWILIO_AUTH_TOKEN = abcdxxx
```

**TODO** Obtain an IP Messaging instance SID. Eventually you'll be able to do this
via REST API. 

```
export TWILIO_IP_SERVICE_SID = IPxxx
```

Your account also needs to be set up for the IP Messaging beta in Monkey. Go to:

`https://monkey.twilio.com/accounts/YOUR_ACCOUNT_SID/flags`

and search for "IP Messaging Beta". Click the box next to it to enable the flag.

You should be all set! Run the application with `node server.js` and visit
[the demo app running on port 3000](http://localhost:3000). Open a new browser
window/tab and visit the same URL, registering with a different name. Invite your
other user to the channel, and chat away!


