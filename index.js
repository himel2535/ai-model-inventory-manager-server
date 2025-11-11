const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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

    // ---Models---

    app.get("/models", async (req, res) => {
      const result = await aiModelCollection.find().toArray();
      res.send(result);
    });

    app.get("/models/:id", async (req, res) => {
      const { id } = req.params;
      const objectId = new ObjectId(id);

      const result = await aiModelCollection.findOne({ _id: objectId });
      res.send(result);
    });

    app.post("/models", async (req, res) => {
      const data = req.body;
      const result = await aiModelCollection.insertOne(data);
      res.send(result);
    });

    app.put("/models/:id", async (req, res) => {
      const { id } = req.params;
      const data = req.body;
      console.log(id);
      const objectId = new ObjectId(id);

      const query = { _id: objectId };
      const update = {
        $set: data,
      };

      const result = await aiModelCollection.updateOne(query, update);
      res.send({
        success: true,
        result,
      });
    });

    app.delete("/models/:id", async (req, res) => {
      const { id } = req.params;
      const objectId = new ObjectId(id);
      const query = { _id: objectId };

      const result = await aiModelCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/latest-models", async (req, res) => {
      const result = await aiModelCollection
        .find()
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get("/my-models", async (req, res) => {
      const email = req.query.email;
      const result = await aiModelCollection
        .find({ createdBy: email })
        .toArray();
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
