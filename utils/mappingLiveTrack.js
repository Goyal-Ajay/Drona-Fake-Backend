export function mapLiveTrackToTrip(liveTrack) {
    const locations = liveTrack.locations || [];
    const startLoc = locations[0] || {};
    const endLoc = locations[locations.length - 1] || {};

    const startDate = new Date(liveTrack.startTime).getTime();
    const endDate = endLoc.timestamp
        ? new Date(endLoc.timestamp).getTime()
        : startDate;

    return {
        lonestarId: "LS_STATIC",
        tripId: liveTrack._id,
        tripStatus: liveTrack.status,
        deviceId: liveTrack.imei,
        imei: liveTrack.imei,
        vehicleId: liveTrack.imei,
        vin: liveTrack.imei,

        startDate,
        endDate,

        startLatitude: liveTrack.startLat,
        startLongitude: liveTrack.startLng,
        startSpeed: startLoc.speed || 0,
        startHeading: 0,
        startElevation: 0,

        endLatitude: endLoc.lat || liveTrack.startLat,
        endLongitude: endLoc.lng || liveTrack.startLng,
        endSpeed: endLoc.speed || 0,
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

        safetyScore: 100.0,
        driverScore: 100.0,
        vehicleScore: 100.0,
        tripScore: 100.0,

        tripDistance: liveTrack.totalDistance || 0,
        tripDuration: endDate - startDate,
        tripScoreCalculation: "Completed",

        startAddress: startLoc.address || "",
        endAddress: endLoc.address || "",

        startTzName: "UTC",
        startTzAbbreviation: "UTC",
        endTzName: "UTC",
        endTzAbbreviation: "UTC",

        startLocalizedTsInMilliSeconds: startDate,
        endLocalizedTsInMilliSeconds: endDate,

        estimatedStartAddress: true,
        estimatedEndAddress: true,
        qualifiedTrip: true,

        totalDistanceInKms: (liveTrack.totalDistance || 0).toFixed(2),
        totalDistanceInMiles: (
            (liveTrack.totalDistance || 0) * 0.621371
        ).toFixed(2),

        vehicleLiveTracks: locations.map((loc) => ({
            tsInMilliSeconds: new Date(loc.timestamp).getTime(),
            latitude: loc.lat,
            longitude: loc.lng,
            elevation: 0,
            speed: loc.speed || 0,
            heading: 0,
        })),
    };
}
