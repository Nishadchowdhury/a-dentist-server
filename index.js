const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { response } = require('express');

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

async function run() {

    try {
        await client.connect();
        const servicesCollections = client.db("doctors_portal").collection("services");
        const bookingCollections = client.db("doctors_portal").collection("bookings");
        const userCollections = client.db("doctors_portal").collection("users");



        //getting all data
        app.get(('/doctorServices'), async (req, res) => {
            const query = {};
            const cursor = servicesCollections.find(query);
            const services = await cursor.toArray();
            res.send(services)


        })


        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollections.findOne({ email: email })
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            const requester = req.decoded.email;

            const requesterAccount = await userCollections.findOne({ email: requester });

            if (requesterAccount.role === 'admin') {
                const filter = { email: email }
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollections.updateOne(filter, updateDoc);
                res.send(result);
            } else {
                res.status(403).send({ message: 'forbidden' });
            }
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
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });

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


        //booking something
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patientName: booking.patientName }
            console.log(query);
            const exist = await bookingCollections.findOne(query);
            console.log(exist);
            if (exist) {
                return res.send({ success: false, booking: exist })
            }
            const result = await bookingCollections.insertOne(booking);
            return res.send({ success: true, result: '' });


        })

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollections.find().toArray();
            res.send(users);
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