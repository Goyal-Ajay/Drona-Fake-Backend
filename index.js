import express from "express";
import cors from "cors";
import { connectDB } from "./db.js";
import "dotenv/config";
import morgan from "morgan";
import mongoose from "mongoose";

const PORT = process.env.PORT || 6001;
await connectDB();

let corsOptions = {
    origin: ["http://localhost:5173"],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
};

const app = express();

// Middleware
app.use(express.json({ limit: "30mb", extended: true }));
app.use(express.urlencoded({ extended: true }));

app.use(morgan("dev"));
app.use(cors(corsOptions));

// ROUTES
app.get("/", (req, res) => {
    res.send("API is running.......");
});

app.get("/api/device-points", async (req, res) => {
    try {
        const collection = mongoose.connection.collection("trips");

        const points = await collection
            .aggregate([
                { $sort: { createdAt: -1 } },
                {
                    $group: {
                        _id: "$imei",
                        trip: { $first: "$$ROOT" },
                    },
                },
                {
                    $addFields: {
                        "trip.lastLocation": {
                            $arrayElemAt: ["$trip.locations", -1],
                        },
                    },
                },
                {
                    $project: {
                        "trip.locations": 0,
                        "trip.events": 0,
                    },
                },
                { $replaceRoot: { newRoot: "$trip" } },
            ])
            .toArray();
        if (points.length === 0) {
            return res
                .status(404)
                .json({ success: false, message: "No entries found" });
        }

        res.status(200).json({ success: true, data: points });
    } catch (error) {
        console.error("Error fetching device points:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message,
        });
    }
});

app.get("/api/livetrack", async (req, res) => {
    try {
        const { imei } = req.query;
        const collection = mongoose.connection.collection("trips");
        let lastPoint;
        let trip = await collection.findOne(
            { imei },
            { sort: { createdAt: -1 } },
        );

        res.status(200).json({
            success: true,
            data: lastPoint ? lastPoint : trip,
        });
    } catch (error) {
        console.error("Error processing livetrack event:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message,
        });
    }
});

// app.get("/api/trips/active", async (req, res) => {
//     try {
//         const trips = await getActiveTrips();
//         res.status(200).json({ success: true, data: trips });
//     } catch (error) {
//         console.error("Error fetching active trips:", error);
//         res.status(500).json({
//             success: false,
//             message: "Server error",
//             error: error.message,
//         });
//     }
// });

// app.get("/api/trips/:id", async (req, res) => {
//     try {
//         const trip = await getTripById(req.params.id);
//         if (!trip) {
//             return res
//                 .status(404)
//                 .json({ success: false, message: "Trip not found" });
//         }
//         res.status(200).json({ success: true, data: trip });
//     } catch (error) {
//         console.error("Error fetching trip:", error);
//         res.status(500).json({
//             success: false,
//             message: "Server error",
//             error: error.message,
//         });
//     }
// });

// app.get("/api/trips", async (req, res) => {
//     try {
//         const { imei } = req.query;
//         if (!imei) {
//             return res
//                 .status(400)
//                 .json({ success: false, message: "IMEI is required" });
//         }
//         const trips = await getTripsByImei(imei);
//         res.status(200).json({ success: true, data: trips });
//     } catch (error) {
//         console.error("Error fetching trips:", error);
//         res.status(500).json({
//             success: false,
//             message: "Server error",
//             error: error.message,
//         });
//     }
// });

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
