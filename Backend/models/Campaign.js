import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
	{
		ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
		name: { type: String, required: true, trim: true, maxlength: 80 },
		description: { type: String, trim: true, maxlength: 300, default: "" },
	},
	{ timestamps: true },
);

campaignSchema.index({ ownerId: 1, name: 1 }, { unique: true });

export default mongoose.model("Campaign", campaignSchema);
