#!/usr/bin/env node
/**
 * sendTestNotification.js
 *
 * Sends a test FCM push notification to a specific user by their MongoDB _id.
 *
 * Usage:
 *   node scripts/sendTestNotification.js [userId] [title] [body]
 *
 * Defaults:
 *   userId : 6968705505595e474928a310
 *   title  : "Test Notification 🔔"
 *   body   : "This is a test push notification from Lubus Backend."
 *
 * Examples:
 *   node scripts/sendTestNotification.js
 *   node scripts/sendTestNotification.js 6968705505595e474928a310 "Hello" "World"
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/mongodb.config");
const User = require("../schemas/user.schema");
const { sendFcmNotifications } = require("../functions/fcm");

// ─── CLI args ────────────────────────────────────────────────────────────────
const userId = process.argv[2] || "6968705505595e474928a310";
const title  = process.argv[3] || "Test Notification 🔔";
const body   = process.argv[4] || "This is a test push notification from Lubus Backend.";
const data   = { type: "test", sentAt: new Date().toISOString() };
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n📡 Lubus – FCM Test Notification Script");
  console.log("─".repeat(45));

  // 1. Connect to DB
  await new connectDB();

  // 2. Find user
  console.log(`\n🔍 Looking up user: ${userId}`);
  const user = await User.findById(userId).select("name email fcmTokens");

  if (!user) {
    console.error("❌ User not found.");
    process.exit(1);
  }

  console.log(`✅ Found user: ${user.name} <${user.email}>`);
  console.log(`   FCM tokens  : ${user.fcmTokens?.length || 0}`);

  if (!user.fcmTokens || user.fcmTokens.length === 0) {
    console.warn("\n⚠️  No FCM tokens registered for this user.");
    console.warn("   Make sure the mobile app has called PUT /api/auth/fcm-token at least once.");
    process.exit(1);
  }

  // 3. Send notification
  console.log(`\n📤 Sending notification to ${user.fcmTokens.length} token(s)…`);
  console.log(`   Title : ${title}`);
  console.log(`   Body  : ${body}`);

  const results = await sendFcmNotifications(user.fcmTokens, title, body, data);

  // 4. Report
  console.log("\n📊 Results:");
  console.log(`   ✅ Delivered : ${results.success.length}`);
  console.log(`   ❌ Failed    : ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.warn("\n   Failed tokens:");
    results.errors.forEach((t) => console.warn(`     - ${t}`));
  }

  console.log("\n✅ Done.\n");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Unexpected error:", err);
  mongoose.disconnect().finally(() => process.exit(1));
});
