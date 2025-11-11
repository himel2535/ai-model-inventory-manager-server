const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");

const serviceAccount = require("./ai-model-inventory-service-key.json");
const app = express();
const port = process.env.PORT || 3000;

// ---middleware---

app.use(cors());
app.use(express.json());

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const verifyFBToken = async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.status(401).send({
      message: "Unauthorized access, Token not found",
    });
  }

  const token = authorization.split(" ")[1];

  try {
    await admin.auth().verifyIdToken(token);
    next();
  } catch (error) {
    res.status(401).send({
      message: "Unauthorized access",
    });
  }
};

// --------------------

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

    const purchaseModelCollection = db.collection("purchased-model");

    // -------------

    // ---Models---

    // ---all models get---
    app.get("/models", async (req, res) => {
      const result = await aiModelCollection.find().toArray();
      res.send(result);
    });

    // ---view details get---
    app.get("/models/:id", verifyFBToken, async (req, res) => {
      const { id } = req.params;
      const objectId = new ObjectId(id);

      const result = await aiModelCollection.findOne({ _id: objectId });
      res.send(result);
    });

    // ----Create Model----
    app.post("/models", async (req, res) => {
      const data = req.body;
      const result = await aiModelCollection.insertOne(data);
      res.send(result);
    });

    // ----Update Model---
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

    // ----Delete Models----
    app.delete("/models/:id", async (req, res) => {
      const { id } = req.params;
      const objectId = new ObjectId(id);
      const query = { _id: objectId };

      const result = await aiModelCollection.deleteOne(query);
      res.send(result);
    });

    // ----Latest Models----
    app.get("/latest-models", async (req, res) => {
      const result = await aiModelCollection
        .find()
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // ----My Models----
    app.get("/my-models", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const result = await aiModelCollection
        .find({ createdBy: email })
        .toArray();
      res.send(result);
    });

    // ----Purchased Model create----
    app.post("/purchased-model/:id", async (req, res) => {
      try {
        const data = req.body;
        const id = req.params.id;

        const result = await purchaseModelCollection.insertOne(data);

        // --increase Count purchase---
        const filter = { _id: new ObjectId(id) };
        const update = { $inc: { purchased: 1 } };
        const updatedModel = await aiModelCollection.updateOne(filter, update);

        res.send({
          result,
          updatedModel,
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Something went wrong" });
      }
    });

    // ----Purchased Model Page get---
    app.get("/model-purchase-page", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const result = await purchaseModelCollection
        .find({ purchasedBy: email })
        .toArray();
      res.send(result);
    });


    // ---search and filter---

    app.get("/search", async (req, res) => {
      const search_text = req.query.search || "";
      const framework = req.query.framework || "";

     
      const query = {
        name: { $regex: search_text, $options: "i" },
      };

      if (framework) {
        query.framework = framework;
      }

      const result = await aiModelCollection.find(query).toArray();
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
