const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");

const app = express();
const port = process.env.PORT || 3000;

// ---middleware---

app.use(cors());
app.use(express.json());

const decoded = Buffer.from(
  process.env.FIREBASE_SERVICE_KEY,
  "base64"
).toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
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
    // await client.connect();

    const db = client.db("ai-models-db");
    const aiModelCollection = db.collection("ai-models");

    const purchaseModelCollection = db.collection("purchased-model");
    const userCollection = db.collection("users");


    // ---Models---


    // ---all models get--- (only approved models)

    app.get("/models", async (req, res) => {
      const query = {
        $or: [
          { approvalStatus: "approved" },
          { approvalStatus: { $exists: false } }
        ]
      };
      
      const result = await aiModelCollection
        .find(query)
        .toArray();
      res.send(result);
    });


    // Get pending models (admin only) - MUST be before /models/:id
    app.get("/models/pending", verifyFBToken, async (req, res) => {
      try {
        const pendingModels = await aiModelCollection
          .find({ approvalStatus: "pending" })
          .toArray();
        res.send(pendingModels);
      } catch (err) {
        res.status(500).send({ error: "Failed to fetch pending models" });
      }
    });

    // Approve model (admin only) - MUST be before /models/:id
    app.patch("/models/:id/approve", verifyFBToken, async (req, res) => {
      const { id } = req.params;
      try {
        const objectId = new ObjectId(id);
        const result = await aiModelCollection.updateOne(
          { _id: objectId },
          { $set: { approvalStatus: "approved" } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Failed to approve model" });
      }
    });

    // Reject/Delete model (admin only) - MUST be before /models/:id
    app.delete("/models/:id/reject", verifyFBToken, async (req, res) => {
      const { id } = req.params;
      try {
        const objectId = new ObjectId(id);
        const result = await aiModelCollection.deleteOne({ _id: objectId });
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Failed to reject model" });
      }
    });


    // ---view details get---
    app.get("/models/:id", async (req, res) => {
      const { id } = req.params;
      const objectId = new ObjectId(id);

      const result = await aiModelCollection.findOne({ _id: objectId });
      res.send(result);
    });


    // ----Create Model----
    app.post("/models", verifyFBToken, async (req, res) => {
      const data = req.body;
      const userEmail = data.createdBy;
      
      // Check if user is admin
      const user = await userCollection.findOne({ email: userEmail });
      const isAdmin = user?.role === "admin";
      
      // Set approval status based on user role
      const modelData = {
        ...data,
        approvalStatus: isAdmin ? "approved" : "pending",
        createdAt: new Date()
      };
      
      const result = await aiModelCollection.insertOne(modelData);
      res.send(result);
    });


    // ----Update Model---
    app.put("/models/:id", verifyFBToken, async (req, res) => {
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
    app.delete("/models/:id", verifyFBToken, async (req, res) => {
      const { id } = req.params;
      const objectId = new ObjectId(id);
      const query = { _id: objectId };

      const result = await aiModelCollection.deleteOne(query);
      res.send(result);
    });


    // ----Latest Models---- (only approved)
    app.get("/latest-models", async (req, res) => {
      const query = {
        $or: [
          { approvalStatus: "approved" },
          { approvalStatus: { $exists: false } }
        ]
      };

      const result = await aiModelCollection
        .find(query)
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
    app.get("/model-purchase-page", async (req, res) => {
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

    // --- User Roles & Synchronization ---

    // app.put("/users", async (req, res) => {
    //   try {
    //     const user = req.body;
    //     console.log("Received user data:", user);
        
    //     const query = { email: user.email };
    //     const options = { upsert: true };
        
    //     const updateDoc = {
    //       $set: {
    //         ...user,
    //         role: user.role || "user", // Default role
    //         updatedAt: new Date()
    //       },
    //     };
        
    //     const result = await userCollection.updateOne(query, updateDoc, options);
    //     console.log("User save result:", result);
        
    //     res.send({ 
    //       success: true, 
    //       message: "User saved successfully",
    //       result 
    //     });
    //   } catch (error) {
    //     console.error("Error saving user:", error);
    //     res.status(500).send({ 
    //       success: false, 
    //       message: "Failed to save user",
    //       error: error.message 
    //     });
    //   }
    // });

    app.put("/users", async (req, res) => {
      try {
        const { email, name, photo } = req.body;

        const existingUser = await userCollection.findOne({ email });

        if (existingUser) {
          // Update existing user (don't touch role)
          await userCollection.updateOne(
            { email },
            {
              $set: {
                name,
                photo,
                updatedAt: new Date(),
              },
            }
          );
          return res.send({ message: "User updated", success: true });
        }

        // NEW USER - set default role
        await userCollection.insertOne({
          name,
          email,
          photo,
          role: "user",
          createdAt: new Date(),
        });

        res.send({ message: "User created", success: true });
      } catch (error) {
        console.error("Error saving user:", error);
        res.status(500).send({ error: error.message });
      }
    });

    // Get all users (admin only) - MUST be before /users/:email
    app.get("/users/all", verifyFBToken, async (req, res) => {
      try {
        const users = await userCollection.find().toArray();
        res.send(users);
      } catch (err) {
        res.status(500).send({ error: "Failed to fetch users" });
      }
    });

    // Check if user is admin - MUST be before /users/:email
    app.get("/users/admin/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      if (user?.role === "admin") {
        res.send({ admin: true });
      } else {
        res.send({ admin: false });
      }
    });

    // Get user by email
    app.get("/users/:email", verifyFBToken, async (req, res) => {
      try {
        const email = req.params.email;
        const user = await userCollection.findOne({ email });
        
        if (!user) {
          return res.status(404).send({ error: "User not found" });
        }
        
        res.send(user);
      } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).send({ error: error.message });
      }
    });

    // (Routes moved above to fix ordering)

    // --- Statistics ---

    app.get("/admin-stats", verifyFBToken, async (req, res) => {
      const totalModels = await aiModelCollection.countDocuments({ approvalStatus: "approved" });
      const pendingModels = await aiModelCollection.countDocuments({ approvalStatus: "pending" });
      const totalUsers = await userCollection.countDocuments();
      const totalPurchases = await purchaseModelCollection.countDocuments();
      
      // Calculate total platform reach
      const models = await aiModelCollection.find({ approvalStatus: "approved" }).toArray();
      const totalReach = models.reduce((acc, curr) => acc + (curr.purchased || 0), 0);

      res.send({
        totalModels,
        pendingModels,
        totalUsers,
        totalPurchases,
        totalReach
      });
    });

    app.get("/user-stats/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      
      const myModelsCount = await aiModelCollection.countDocuments({ createdBy: email });
      const myPurchasesCount = await purchaseModelCollection.countDocuments({ purchasedBy: email });
      
      const myModels = await aiModelCollection.find({ createdBy: email }).toArray();
      const myReach = myModels.reduce((acc, curr) => acc + (curr.purchased || 0), 0);

      res.send({
        myModelsCount,
        myPurchasesCount,
        myReach
      });
    });

    // -------------

    // await client.db("admin").command({ ping: 1 });
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
