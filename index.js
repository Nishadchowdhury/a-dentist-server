const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { response } = require('express');
var nodemailer = require('nodemailer');
var sgTransport = require('nodemailer-sendgrid-transport');

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ybxbz.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });



function verifyJWT(req, res, next) {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).send({ message: "Unauthorize access" });
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {

        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' })
        }
        req.decoded = decoded;
        next();

    });

}

const emailSenderOption = {
    auth: {
        api_key: process.env.EMAIL_SENDER_KEY,
    }
}


const emailClient = nodemailer.createTransport(sgTransport(emailSenderOption));

//send email function
function sendAppointmentEmail(booking) {
    const { treatment, date, patientName, patientEmail, time } = booking;

    //emailBody
    var email = {
        from: process.env.EMAIL_SENDER,
        to: patientEmail,
        subject: `Your Appointment for ${treatment} is on ${date} at ${time} is Confirmed `,
        text: `Your Appointment for ${treatment} is on ${date} at ${time} is Confirmed `,
        html: `
        <div>
        <p> Hello ${patientName} <p>
        <h3>Your Appointment for ${treatment} is Confirmed</h3>
        <p> looking forward to seeing you on ${date} at ${time}</p>

        <h3>Our Address </h3>
        <p>Andor killa Bandorban</p>
        <p>bangladesh</p>
        <a href="https://www.facebook.com/NishadChowdhury.fb" > Out Owner in Facebook  <b> unsubscribe </b> </a>
        </div>
        `
    };

    emailClient.sendMail(email, function (err, info) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Message sent: ' + info);
        }
    });

}


//send email function
function sendPaymentConfirmationEmail(booking) {
    const { treatment, date, patientName, patientEmail, time } = booking;

    //emailBody
    var email = {
        from: process.env.EMAIL_SENDER,
        to: patientEmail,
        subject: `We received your payment for ${treatment} is on ${date} at ${time} is Confirmed `,
        text: `Your payment for this Appointment ${treatment} is on ${date} at ${time} is Confirmed `,
        html: `
        <div>
        <p> Hello ${patientName} <p>
        <h1>Thank you for your payment </h1>
        <h2>We have receive your payment </h2>

        <h3>Our Address </h3>
        <p>Andor killa Bandorban</p>
        <p>bangladesh</p>
        <a href="https://www.facebook.com/NishadChowdhury.fb" > Out Owner in Facebook  <b> unsubscribe </b> </a>
        </div>
        `
    };

    emailClient.sendMail(email, function (err, info) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Message sent: ' + info);
        }
    });

}



async function run() {

    try {
        await client.connect();
        const servicesCollections = client.db("doctors_portal").collection("services");
        const bookingCollections = client.db("doctors_portal").collection("bookings");
        const userCollections = client.db("doctors_portal").collection("users");
        const doctorCollections = client.db("doctors_portal").collection("doctors");
        const paymentCollections = client.db("doctors_portal").collection("payment");


        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollections.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            } else {
                return res.status(403).send({ message: 'Forbidden access' });
            }
        }



        //getting all data
        app.get(('/doctorServices'), async (req, res) => {
            const query = {};
            const cursor = servicesCollections.find(query).project({ name: 1, _id: 0 });
            const services = await cursor.toArray();
            res.send(services)


        })

        app.get(('/doctorServicesName'), async (req, res) => {
            const query = {};
            const cursor = servicesCollections.find(query).project({ name: 1, _id: 0 });
            const services = await cursor.toArray();
            res.send(services)


        })


        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollections.findOne({ email: email })
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }

            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollections.updateOne(filter, updateDoc);
            res.send(result);

        })




        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email }
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };

            const result = await userCollections.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10d' });

            res.send({ result, token });

        })


        //warning
        // getting available slots ,(this is not the proper way  to query  soooo use (aggregate lookup, pipeline , match, group)
        app.get(`/available`, async (req, res) => {
            const date = req.query.date;

            //step 1 : get all services
            const services = await servicesCollections.find().toArray();

            // step 2 : get the booking of the day
            const query = { date: date }
            const bookings = await bookingCollections.find(query).toArray();

            //step 3 : for each service
            services.forEach(service => {
                // step 4 : find the booking for that service. outPut [{},{},{},{}]
                const serviceBooking = bookings.filter(book => book.treatment === service.name);
                // step 5: selet slots for the service booking: ['','','','']
                const booked = serviceBooking.map(book => book.time);
                // step 6: select those slots that are not in booked 
                const available = service.slots.filter(time => !booked.includes(time));
                // step 7: set availabl to slots to make it easer .
                service.slots = available;
            })

            res.send(services);

        })


        /** 
         * API naming convention
         * app.get('./booking) // get all booking in this collection . or get more then one or by filter 
         * app.get('./booking:/id) // get a specific booking by id
         * app.post('./booking) //  add a booking
         * app.patch('./booking:/id) //  update a booking data 
         * app.delete('./booking:/id) //  delete a specific booking
         *
         */


        app.get('/booking', verifyJWT, async (req, res) => {
            const patientEmail = req.query.patientEmail;
            const decodedEmail = req.decoded.patientEmail || req.decoded.email;

            if (patientEmail === decodedEmail) {
                const query = { patientEmail: patientEmail };
                const bookings = await bookingCollections.find(query).toArray();
                res.send(bookings);
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' });
            }
        })


        app.get('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const booking = await bookingCollections.findOne(query);
            res.send(booking);
        })



        app.patch('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) }
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                },
            };
            const result = await paymentCollections.insertOne(payment)
            const updatedBooking = await bookingCollections.updateOne(filter, updateDoc);

            res.send(updateDoc);

        })


        //booking something
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patientName: booking.patientName }
            console.log(query);
            const exist = await bookingCollections.findOne(query);
            if (exist) {
                return res.send({ success: false, booking: exist })
            }
            const result = await bookingCollections.insertOne(booking);
            console.log('sending email');
            sendAppointmentEmail(booking);

            return res.send({ success: true, result: '' });
        })

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollections.find().toArray();
            res.send(users);
        })

        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollections.find().toArray();

            res.send(doctors);
        })


        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollections.insertOne(doctor);
            res.send(result);
        })

        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            console.log(email);
            const query = { email: email }
            const result = await doctorCollections.deleteOne(query);
            res.send(result);
        })



        //payment payment payment payment payment payment payment payment payment payment 

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            // const { price } = req.body;
            const service = req.body;
            const price = service.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        })
    }
    finally {

    }

}

run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello World! from Doctors app')
})

app.listen(port, () => {
    console.log(`Doctors app listening on port${port}`)
})