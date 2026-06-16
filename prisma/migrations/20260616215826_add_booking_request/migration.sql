-- CreateTable
CREATE TABLE "BookingRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "estimatedCents" INTEGER,
    "finalCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethodId" TEXT,
    "stripePaymentId" TEXT,
    "otaProvider" TEXT,
    "otaConfirmation" TEXT,
    "failureReason" TEXT,
    "conciergeUserId" TEXT,
    "conciergeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "bookedAt" TIMESTAMP(3),

    CONSTRAINT "BookingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingRequest_userId_createdAt_idx" ON "BookingRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingRequest_status_createdAt_idx" ON "BookingRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BookingRequest_tripId_idx" ON "BookingRequest"("tripId");

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

