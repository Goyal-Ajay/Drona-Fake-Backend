import mongoose from "mongoose";

const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const toRad = (deg) => deg * (Math.PI / 180);

const calculateDuration = (startTime, endTime) => {
    return new Date(endTime) - new Date(startTime);
};

export const processTripEvent = async (eventData) => {
    const { imei, eventType, latitude, longitude, timestamp } = eventData;
    const collection = mongoose.connection.collection("trips");
    const livetrackCollection = mongoose.connection.collection("livetrack");

    const activeTrip = await collection.findOne({
        imei,
        status: "active"
    });

    if (eventType === "IgnitionOn") {
        if (activeTrip) {
            console.log(`Trip already active for IMEI: ${imei}`);
            return;
        }

        const newTrip = {
            imei,
            startTime: timestamp || new Date(),
            startLat: latitude,
            startLng: longitude,
            locations: [{ lat: latitude, lng: longitude, timestamp: timestamp || new Date() }],
            totalDistance: 0,
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await collection.insertOne(newTrip);
        console.log(`Trip started for IMEI: ${imei}`);
        return newTrip;
    }

    if (eventType === "IgnitionOff") {
        if (!activeTrip) {
            console.log(`No active trip found for IMEI: ${imei}`);
            return;
        }

        const endLat = latitude;
        const endLng = longitude;
        const endTime = timestamp || new Date();

        let totalDistance = activeTrip.totalDistance;
        if (activeTrip.locations.length > 0) {
            const lastLocation = activeTrip.locations[activeTrip.locations.length - 1];
            totalDistance += calculateDistance(lastLocation.lat, lastLocation.lng, endLat, endLng);
        }

        const duration = calculateDuration(activeTrip.startTime, endTime);

        const completedTrip = {
            ...activeTrip,
            endTime,
            endLat,
            endLng,
            locations: [...activeTrip.locations, { lat: latitude, lng: longitude, timestamp: endTime }],
            totalDistance: Math.round(totalDistance * 1000) / 1000,
            duration,
            status: "completed",
            updatedAt: new Date()
        };

        await collection.replaceOne({ _id: activeTrip._id }, completedTrip);
        console.log(`Trip completed for IMEI: ${imei}, Distance: ${completedTrip.totalDistance}km, Duration: ${duration}ms`);
        return completedTrip;
    }

    if (latitude && longitude) {
        if (activeTrip) {
            const lastLocation = activeTrip.locations[activeTrip.locations.length - 1];
            const distance = calculateDistance(lastLocation.lat, lastLocation.lng, latitude, longitude);
            const newTotalDistance = activeTrip.totalDistance + distance;

            await collection.updateOne(
                { _id: activeTrip._id },
                {
                    $push: {
                        locations: { lat: latitude, lng: longitude, timestamp: timestamp || new Date() }
                    },
                    $set: {
                        totalDistance: Math.round(newTotalDistance * 1000) / 1000,
                        updatedAt: new Date()
                    }
                }
            );
        } else {
            await livetrackCollection.insertOne({
                imei,
                latitude,
                longitude,
                eventType,
                timestamp: timestamp || new Date(),
                createdAt: new Date()
            });
        }
    }
};

export const getActiveTrips = async () => {
    const collection = mongoose.connection.collection("trips");
    return await collection.find({ status: "active" }).toArray();
};

export const getTripById = async (tripId) => {
    const collection = mongoose.connection.collection("trips");
    return await collection.findOne({ _id: new mongoose.Types.ObjectId(tripId) });
};

export const getTripsByImei = async (imei) => {
    const collection = mongoose.connection.collection("trips");
    return await collection.find({ imei }).sort({ startTime: -1 }).toArray();
};
