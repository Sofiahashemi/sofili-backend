const mongoose = require("mongoose");

const typeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
  },
  { _id: false }
);

const designSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    image: { type: String, required: true }, // base64 data URL
    json: { type: String, required: true },  // fabric JSON string
    jewelryType: { type: typeSchema, required: true },
    metalType: { type: typeSchema, required: true },
    notes: { type: String, default: "" },
    status: { type: String, default: "pending" },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Design", designSchema);