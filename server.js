const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("./User");
const Journal = require("./models/Journal");
const { encrypt, decrypt } = require("./utils/encryption");

const app = express();

app.use(cors());
app.use(express.json());


// ======================================================
// MONGODB CONNECTION
// ======================================================

mongoose
  .connect(
    process.env.MONGODB_URI ||
      "mongodb+srv://mindwell:MindWell2026Test@cluster0.pmbyypn.mongodb.net/mindwell?appName=Cluster0"
  )
  .then(() => {
    console.log("MongoDB connected successfully");
  })
  .catch((error) => {
    console.log("MongoDB connection error:", error);
  });


// ======================================================
// JWT
// ======================================================

const JWT_SECRET =
  process.env.JWT_SECRET || "MINDWELL_SECRET_KEY";


// ======================================================
// HOME
// ======================================================

app.get("/", (req, res) => {
  res.send("MindWell backend is running!");
});


// ======================================================
// AUTH MIDDLEWARE
// ======================================================

function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(
      token,
      JWT_SECRET
    );

    req.userId = decoded.userId;

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}


// ======================================================
// REGISTER
// ======================================================

app.post("/api/register", async (req, res) => {
  try {
    const {
      username,
      email,
      password,
    } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        message: "Please fill all fields",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message:
          "Password must be at least 6 characters",
      });
    }

    const existingUsername =
      await User.findOne({
        username,
      });

    if (existingUsername) {
      return res.status(400).json({
        message: "Username already exists",
      });
    }

    const existingEmail =
      await User.findOne({
        email: email.toLowerCase(),
      });

    if (existingEmail) {
      return res.status(400).json({
        message: "Email already exists",
      });
    }

    const hashedPassword =
      await bcrypt.hash(password, 10);

    const user = new User({
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
      isPro: false,
    });

    await user.save();

    const token = jwt.sign(
      {
        userId: user._id,
      },
      JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.status(201).json({
      message: "Registration successful!",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isPro: user.isPro,
      },
    });
  } catch (error) {
    console.log(
      "Register error:",
      error
    );

    res.status(500).json({
      message: "Registration failed",
    });
  }
});


// ======================================================
// LOGIN
// ======================================================

app.post("/api/login", async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message:
          "Please enter email and password",
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
    });

    if (!user) {
      return res.status(401).json({
        message:
          "Invalid email or password",
      });
    }

    const passwordMatch =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!passwordMatch) {
      return res.status(401).json({
        message:
          "Invalid email or password",
      });
    }

    const token = jwt.sign(
      {
        userId: user._id,
      },
      JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.status(200).json({
      message: "Login successful!",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isPro: user.isPro,
      },
    });
  } catch (error) {
    console.log(
      "Login error:",
      error
    );

    res.status(500).json({
      message: "Login failed",
    });
  }
});


// ======================================================
// AUTHENTICATED USER
// ======================================================

app.get(
  "/api/auth/me",
  authenticateToken,
  async (req, res) => {
    try {
      const user =
        await User.findById(
          req.userId
        ).select("-password");

      if (!user) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      res.status(200).json({
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          isPro: user.isPro,
        },
      });
    } catch (error) {
      console.log(
        "Auth error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to get user",
      });
    }
  }
);


// ======================================================
// CREATE JOURNAL
// ======================================================

app.post(
  "/api/journal",
  authenticateToken,
  async (req, res) => {
    try {
      const {
        title,
        content,
        mood,
        energy,
        emotion,
      } = req.body;

      if (!title || !content) {
        return res.status(400).json({
          message:
            "Title and content are required",
        });
      }

      const journal = new Journal({
        userId: req.userId,
        title,
        content: encrypt(content),
        mood,
        energy,
        emotion,
      });

      await journal.save();

      res.status(201).json({
        message:
          "Journal saved successfully",

        journal: {
          id: journal._id,
          title: journal.title,
          mood: journal.mood,
          energy: journal.energy,
          emotion: journal.emotion,
          createdAt:
            journal.createdAt,
        },
      });
    } catch (error) {
      console.log(
        "Create journal error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to save journal",
      });
    }
  }
);


// ======================================================
// GET USER JOURNALS
// ======================================================

app.get(
  "/api/journal",
  authenticateToken,
  async (req, res) => {
    try {
      const journals =
        await Journal.find({
          userId: req.userId,
        }).sort({
          createdAt: -1,
        });

      const decryptedJournals =
        journals.map(
          (journal) => ({
            ...journal.toObject(),
            content: decrypt(
              journal.content
            ),
          })
        );

      res.status(200).json(
        decryptedJournals
      );
    } catch (error) {
      console.log(
        "Get journals error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to get journals",
      });
    }
  }
);


// ======================================================
// GET SINGLE JOURNAL
// ======================================================

app.get(
  "/api/journal/entry/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const journal =
        await Journal.findOne({
          _id: req.params.id,
          userId: req.userId,
        });

      if (!journal) {
        return res.status(404).json({
          message:
            "Journal not found",
        });
      }

      const decryptedJournal = {
        ...journal.toObject(),
        content: decrypt(
          journal.content
        ),
      };

      res.status(200).json(
        decryptedJournal
      );
    } catch (error) {
      console.log(
        "Get journal error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to get journal",
      });
    }
  }
);


// ======================================================
// DELETE JOURNAL
// ======================================================

app.delete(
  "/api/journal/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const journal =
        await Journal.findOneAndDelete({
          _id: req.params.id,
          userId: req.userId,
        });

      if (!journal) {
        return res.status(404).json({
          message:
            "Journal not found",
        });
      }

      res.status(200).json({
        message:
          "Journal deleted successfully",
      });
    } catch (error) {
      console.log(
        "Delete journal error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to delete journal",
      });
    }
  }
);


// ======================================================
// ADVANCED ANALYTICS
// MONGODB AGGREGATION
// ======================================================

app.get(
  "/api/analytics/summary",
  authenticateToken,
  async (req, res) => {
    try {
      const now = new Date();

      // Last 7 days
      const sevenDaysAgo =
        new Date();

      sevenDaysAgo.setDate(
        now.getDate() - 7
      );

      // Last 30 days
      const thirtyDaysAgo =
        new Date();

      thirtyDaysAgo.setDate(
        now.getDate() - 30
      );


      // ==================================================
      // WEEKLY AGGREGATION
      // ==================================================

      const weeklyResult =
        await Journal.aggregate([
          {
            $match: {
              userId:
                new mongoose.Types.ObjectId(
                  req.userId
                ),

              createdAt: {
                $gte: sevenDaysAgo,
              },
            },
          },

          {
            $group: {
              _id: null,

              averageMood: {
                $avg: "$mood",
              },

              averageEnergy: {
                $avg: "$energy",
              },

              totalEntries: {
                $sum: 1,
              },
            },
          },
        ]);


      // ==================================================
      // MONTHLY AGGREGATION
      // ==================================================

      const monthlyResult =
        await Journal.aggregate([
          {
            $match: {
              userId:
                new mongoose.Types.ObjectId(
                  req.userId
                ),

              createdAt: {
                $gte: thirtyDaysAgo,
              },
            },
          },

          {
            $group: {
              _id: null,

              averageMood: {
                $avg: "$mood",
              },

              averageEnergy: {
                $avg: "$energy",
              },

              totalEntries: {
                $sum: 1,
              },
            },
          },
        ]);


      // ==================================================
      // DEFAULT VALUES
      // ==================================================

      const weekly =
        weeklyResult[0] || {
          averageMood: null,
          averageEnergy: null,
          totalEntries: 0,
        };

      const monthly =
        monthlyResult[0] || {
          averageMood: null,
          averageEnergy: null,
          totalEntries: 0,
        };


      // ==================================================
      // RESPONSE
      // ==================================================

      res.status(200).json({
        weekly: {
          averageMood:
            weekly.averageMood !== null
              ? Number(
                  weekly.averageMood.toFixed(
                    1
                  )
                )
              : null,

          averageEnergy:
            weekly.averageEnergy !== null
              ? Number(
                  weekly.averageEnergy.toFixed(
                    1
                  )
                )
              : null,

          totalEntries:
            weekly.totalEntries,
        },

        monthly: {
          averageMood:
            monthly.averageMood !== null
              ? Number(
                  monthly.averageMood.toFixed(
                    1
                  )
                )
              : null,

          averageEnergy:
            monthly.averageEnergy !== null
              ? Number(
                  monthly.averageEnergy.toFixed(
                    1
                  )
                )
              : null,

          totalEntries:
            monthly.totalEntries,
        },
      });
    } catch (error) {
      console.log(
        "Analytics aggregation error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to calculate advanced analytics",
      });
    }
  }
);


// ======================================================
// START SERVER
// ======================================================

const PORT =
  process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `MindWell backend running on port ${PORT}`
  );
});