const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const { response } = require('express');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ybxbz.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {

    try {
        await client.connect();
        const servicesCollections = client.db("doctors_portal").collection("services");
        const bookingCollections = client.db("doctors_portal").collection("bookings");



        //getting all data
        app.get(('/doctorServices'), async (req, res) => {
            const query = {};
            const cursor = servicesCollections.find(query);
            const services = await cursor.toArray();
            res.send(services)


        })


        //warning
        // getting available slots ,(this is not the proper way  to query  soooo use (aggregate lookup, pipeline , match, group)
        app.get((`/available`), async (req, res) => {
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