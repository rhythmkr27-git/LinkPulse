import mongoose from "mongoose";

const clickEventSchema = new mongoose.Schema({
	linkId: { type: mongoose.Schema.Types.ObjectId, ref: "Link", required: true },
	ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null },
	ts: { type: Date, default: Date.now },
	referrer: { type: String, default: "direct" },
	device: { type: String, default: "desktop" },
	browser: { type: String, default: "Unknown" },
	os: { type: String, default: "Unknown" },
	country: { type: String, default: null },
	city: { type: String, default: null },
	isBot: { type: Boolean, default: false },
	visitorHash: { type: String, required: true },
});

clickEventSchema.index({ linkId: 1, ts: -1 });
clickEventSchema.index({ ownerId: 1, ts: -1 });
clickEventSchema.index({ campaignId: 1, ts: -1 });

export default mongoose.model("ClickEvent", clickEventSchema);
