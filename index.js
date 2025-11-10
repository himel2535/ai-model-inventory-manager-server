const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;


// ---middleware---
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@himelcluster.fxzuftr.mongodb.net/?appName=HimelCluster`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("ai-models-db");
    const aiModelCollection = db.collection("ai-models");

    // -------------

    app.get("/models", async (req, res) => {
      const result = await aiModelCollection.find().toArray();
      res.send(result);
    });

    // -------------

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Ai Model Inventory Server is running");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
