-- CreateTable
CREATE TABLE "SavedPlace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" TEXT,
    "venueName" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "placeTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT NOT NULL DEFAULT 'other',
    "thumbnail" TEXT,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "notes" TEXT,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NearbyNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NearbyNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedPlace_userId_savedAt_idx" ON "SavedPlace"("userId", "savedAt" DESC);

-- CreateIndex
CREATE INDEX "SavedPlace_userId_category_idx" ON "SavedPlace"("userId", "category");

-- CreateIndex
CREATE INDEX "SavedPlace_userId_lat_lon_idx" ON "SavedPlace"("userId", "lat", "lon");

-- CreateIndex
CREATE INDEX "SavedPlace_tripId_idx" ON "SavedPlace"("tripId");

-- CreateIndex
CREATE INDEX "NearbyNotification_userId_notifiedAt_idx" ON "NearbyNotification"("userId", "notifiedAt" DESC);

-- CreateIndex
CREATE INDEX "NearbyNotification_placeId_notifiedAt_idx" ON "NearbyNotification"("placeId", "notifiedAt" DESC);

-- AddForeignKey
ALTER TABLE "SavedPlace" ADD CONSTRAINT "SavedPlace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPlace" ADD CONSTRAINT "SavedPlace_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TripDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NearbyNotification" ADD CONSTRAINT "NearbyNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NearbyNotification" ADD CONSTRAINT "NearbyNotification_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "SavedPlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
