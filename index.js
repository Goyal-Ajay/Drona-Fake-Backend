import express from "express";
import cors from "cors";
import { connectDB } from "./db.js";
import "dotenv/config";
import morgan from "morgan";
import mongoose from "mongoose";
import { mapLiveTrackToTrip } from "./utils/mappingLiveTrack.js";

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
        let trip = await collection.findOne(
            { imei, status: "active" },
            { sort: { createdAt: -1 } },
        );

        const mapped = mapLiveTrackToTrip(trip);

        res.status(200).json({
            success: true,
            data: mapped,
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

app.get("/api/vehicle", async (req, res) => {
    try {
        const { imei, page = 1, pageSize = 10 } = req.query;

        if (!imei) {
            return res.status(400).json({ message: "imei is required" });
        }

        // 1️⃣ Fetch valid trips
        const collection = mongoose.connection.collection("trips");
        const trips = await collection
            .find({
                imei,
                tripValid: true,
            })
            .sort({ createdAt: -1 })
            .toArray();

        console.log("Trips: ", trips);

        if (!trips.length) {
            return res.json({
                pageDetails: {
                    totalRecords: 0,
                    pageSize: Number(pageSize),
                    currentPage: Number(page),
                },
                devices: [],
            });
        }

        const latestTrip = trips[0];

        // 2️⃣ Aggregate totals
        let totalDistance = 0;
        let totalDuration = 0;
        let totalIncidentCount = 0;
        let totalShockCount = 0;
        let totalSosCount = 0;

        trips.forEach((trip) => {
            totalDistance += trip.totalDistance || 0;
            totalDuration += trip.duration || 0;

            (trip.events || []).forEach((e) => {
                totalIncidentCount += 1;

                if (["Shock", "ManualBackup"].includes(e.eventType)) {
                    totalShockCount += 1;
                }

                if (e.eventType === "SOS") {
                    totalSosCount += 1;
                }
            });
        });

        // 3️⃣ Last live track
        const lastLocation =
            latestTrip.locations[latestTrip.locations.length - 1];

        const lastLiveTrack = {
            tsInMilliSeconds: new Date(lastLocation.timestamp).getTime(),
            gnssInfo: {
                isValid: true,
                speed: lastLocation.speed || 0,
                heading: 0,
                longitude: lastLocation.lng,
                latitude: lastLocation.lat,
                elevation: 0,
            },
        };

        // 4️⃣ Snapshots
        const snapshot = trips.flatMap((trip) =>
            (trip.events || [])
                .filter((e) => e.eventType === "Snapshot")
                .map((e) => ({
                    camera: 1,
                    urls: e.MediaURLs.map((m) => ({
                        updatedAt: new Date(e.timestamp).toISOString(),
                        url: m.url,
                    })),
                })),
        );

        // 5️⃣ Latest Trip Mapping
        const mappedLatestTrip = {
            lonestarId: "LS_STATIC",
            tripId: latestTrip._id.toString(),
            tripStatus: latestTrip.status,
            deviceId: latestTrip.imei,
            imei: latestTrip.imei,
            vehicleId: latestTrip.imei,
            vin: latestTrip.imei,

            startDate: new Date(latestTrip.startTime).getTime(),
            endDate: new Date(latestTrip.endTime).getTime(),

            startLatitude: latestTrip.startLat,
            startLongitude: latestTrip.startLng,
            startSpeed: latestTrip.locations?.[0]?.speed || 0,
            startHeading: 0,
            startElevation: 0,

            endLatitude: latestTrip.endLat,
            endLongitude: latestTrip.endLng,
            endSpeed: lastLocation.speed || 0,
            endHeading: 0,
            endElevation: 0,

            hardAccelerationCount: 0,
            harshBrakingCount: 0,
            harshCorneringCount: 0,
            incidentCount: 0,
            overSpeedingCount: 0,
            severeShockCount: 0,
            shockCount: 0,
            sosCount: 0,

            safetyScore: 100,
            driverScore: 100,
            vehicleScore: 100,
            tripScore: 100,

            tripDistance: latestTrip.totalDistance,
            tripDuration: latestTrip.duration,
            tripScoreCalculation: "Completed",

            startAddress: "",
            endAddress: "",

            startTzName: "UTC",
            startTzAbbreviation: "UTC",
            endTzName: "UTC",
            endTzAbbreviation: "UTC",

            startLocalizedTsInMilliSeconds: new Date(
                latestTrip.startTime,
            ).getTime(),
            endLocalizedTsInMilliSeconds: new Date(
                latestTrip.endTime,
            ).getTime(),

            estimatedStartAddress: true,
            estimatedEndAddress: true,
            qualifiedTrip: true,

            totalDistanceInKms: (latestTrip.totalDistance / 1000).toFixed(2),
            totalDistanceInMiles: (
                (latestTrip.totalDistance / 1000) *
                0.621371
            ).toFixed(2),
        };

        // 6️⃣ Final Response
        res.json({
            success: true,
            pageDetails: {
                totalRecords: 1,
                pageSize: Number(pageSize),
                currentPage: Number(page),
            },
            devices: [
                {
                    createdAt: latestTrip.createdAt.toDateString(),
                    createdBy: "US1028",
                    createdBySystem: "LONESTAR_API",
                    imei,
                    deviceId: latestTrip.imei,
                    lonestarId: "LS_STATIC",
                    insurerId: "INS9999",
                    status: latestTrip.endReason || "DeviceOffline",
                    deviceProvider: "DronaAIm",
                    statusTsInMilliseconds: new Date(
                        latestTrip.endTime,
                    ).getTime(),

                    lastLiveTrack,
                    snapshot,

                    lookup_vehicles: [
                        {
                            createdAt: new Date().toISOString(),
                            createdBy: "LONESTAR API",
                            vehicleId: latestTrip.imei,
                            vin: latestTrip.imei,
                            deviceId: latestTrip.imei,
                            lonestarId: "LS_STATIC",
                            meanScore: 100,
                            totalDistance,
                            totalDuration,
                            totalHardAccelerationCount: 0,
                            totalHarshBrakingCount: 0,
                            totalHarshCorneringCount: 0,
                            totalIncidentCount,
                            totalOverSpeedingCount: 0,
                            totalSevereShockCount: 0,
                            totalShockCount,
                            totalSosCount,
                            make: "",
                            model: "",
                            year: "",
                            tagLicencePlateNumber: "",
                            totalDistanceInKms: (totalDistance / 1000).toFixed(
                                2,
                            ),
                            totalDistanceInMiles: (
                                (totalDistance / 1000) *
                                0.621371
                            ).toFixed(2),
                            customVehicleId: "",
                            imei,
                            createdByUser: "US1028",
                        },
                    ],

                    latestTrip: mappedLatestTrip,
                    vehicleStatus: latestTrip.status,
                },
            ],
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

app.get("/api/trips", async (req, res) => {
    try {
        const { imei } = req.query;
        if (!imei) {
            return res
                .status(400)
                .json({ success: false, message: "IMEI is required" });
        }
        const collection = mongoose.connection.collection("trips");
        let trips = await collection
            .find({ imei })
            .sort({ createdAt: -1 })
            .toArray();
        res.status(200).json({ success: true, data: trips });
    } catch (error) {
        console.error("Error fetching trips:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message,
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
