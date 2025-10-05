const express = require("express");
const ejsMate = require("ejs-mate");
const path = require("path");
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("./database"); 
const session = require('express-session');
const { sendCredentials, sendCredentialsToAll} = require("./utils/email");
const fs = require("fs");
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const bodyParser = require('body-parser');
const app = express();
require("dotenv").config();
const crypto = require("crypto");
const cors = require("cors");
const _ = require("lodash");
const bcrypt = require('bcrypt');



const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

// Multer storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // Save uploaded files to the 'uploads' folder
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); // Keep the original file name
  },
});

// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

const authenticateToken = (req, res, next) => {
  let token = null;

  // Check if Authorization header contains a Bearer token
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
    console.log("✅ Token extracted from Authorization header:", token);
  } 
  // Fallback: try to get token from cookie
  else if (req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
    console.log("✅ Token extracted from cookies:", token);
  }

  // If no token found, return a 403 error
  if (!token) {
    console.log("❌ No token provided! Redirecting...");
    return res.redirect("/login");  // ✅ Redirect to login instead of sending JSON error
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded; // ✅ Attach decoded payload to req.user
    console.log("✅ Token successfully verified! User:", req.user);
    next(); // Proceed to the next middleware/route handler
  } catch (err) {
    console.error("❌ Token verification error:", err);
    return res.redirect("/login");  // ✅ Redirect to login if token is invalid
  }
};

// Initialize multer with the storage configuration
const upload = multer({ storage: storage });
app.use(session({
  secret: "your_secret_key",  // Change this to a secure key
  resave: false,
  saveUninitialized: true,
}));

app.engine("ejs", ejsMate);
app.use(express.static("css"));
app.use(express.static(path.join(__dirname, "hostit-html")));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Serve the 'uploads' folder as static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(cors());

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static('Faculty-Dashboard_Html'));

// 📌 Routes
app.get('/coordinatordash', authenticateToken, async (req, res) => {
  if (req.user.role !== 'coordinator') {
    return res.redirect('/login');
  }

  try {
    // Fetch student count
    const [studentRows] = await db.promise().execute("SELECT COUNT(*) AS count FROM students");
    const studentCount = studentRows[0].count || 0;

    // Fetch faculty count
    const [facultyRows] = await db.promise().execute("SELECT COUNT(*) AS count FROM faculty");
    const facultyCount = facultyRows[0].count || 0;

    // Fetch mapping count
    const [mappingRows] = await db.promise().execute("SELECT COUNT(*) AS count FROM faculty_student_mapping");
    const mappingCount = mappingRows[0].count || 0;

    res.render('coordinatordash', { 
      user: req.user,
      studentCount,
      facultyCount,
      mappingCount
    });

  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).send("Internal Server Error");
  }
});


app.get("/mapping", (req, res) => res.render("mapping"));
app.get("/download-excel", (req, res) => {
  const filePath = path.join(__dirname, "uploads", "testing123.xlsx");
  res.download(filePath, "Mapping_Format.xlsx", (err) => {
      if (err) {
          console.error("Error downloading file:", err);
          res.status(500).send("Error downloading file");
      }
  });
});



app.get("/faculty-dashboard", authenticateToken, (req, res) => {
  if (req.user.role.toLowerCase() !== "faculty") {
      return res.status(403).send("Access denied. Only faculty can view this page.");
  }
  res.render("faculty-dashboard", { user: req.user });
});

app.get("/admindash", authenticateToken, (req, res) => {
  if (req.user.role.toLowerCase() !== "admin") {
      return res.status(403).send("Access denied. Only admins can view this page.");
  }
  res.render("admindash", { user: req.user });
});



// app.get("/admindash", (req, res) => res.render("admindash"));
app.get("/addstudent", (req, res) => res.render("addstudent"));
app.get("/update-questionaire", (req, res) => res.render("update-questionaire"));
app.get("/addfaculty", (req, res) => res.render("addfaculty"));
app.get("/addfacultyview", (req, res) => res.render("addfacultyview"));
app.get("/viewresult", (req, res) => res.render("viewresult"));
app.get("/create-form", (req, res) => res.render("create-form"));
app.get("/update-form", (req, res) => res.render("update-form"));
app.get('/viewmapping', async (req, res) => {
  try {
      // Fix: Use `.promise().execute()` to properly return rows
      const [facultyStudentMapping] = await db.promise().execute('SELECT * FROM faculty_student_mapping');
      const [facultySkillMapping] = await db.promise().execute('SELECT * FROM faculty_skill_mapping');

      console.log("Faculty-Student Mapping Data:", facultyStudentMapping);
      console.log("Faculty-Skill Mapping Data:", facultySkillMapping);

      res.render('viewmapping', { facultyStudentMapping, facultySkillMapping });
  } catch (error) {
      console.error('Error fetching faculty mappings:', error);
      res.status(500).send('Internal Server Error');
  }
});



app.get("/login", (req, res) => {
  res.render("login", { 
    forgotPasswordLink: "/forgot-password", 
    signUpLink: "/signup" // Or whatever your sign-up route is
  });
});


function isAuthenticated(req, res, next) {
  if (req.session.user && (req.session.user.role === "coordinator" || req.session.user.role === "faculty"))
{
    return next(); // Allow access
  }
  return res.status(403).send("❌ Access Denied. You are not authorized.");
}


app.get("/viewforms", authenticateToken, (req, res) => {
  if (req.user.role.toLowerCase() !== "faculty") {
      return res.status(403).send("Access denied.");
  }
  res.render("viewforms");
});

app.post("/send-credentials", async (req, res) => {
  console.log(req.body); // Debugging: Check received data
  const { facultyId, email,role } = req.body; 

  if (!facultyId || !email) {
      return res.status(400).send("❌ Missing faculty ID or email.");
  }

  // Generate a random password
  const randomPassword = Math.random().toString(36).slice(-8);
  const saltRounds = 10; // Bcrypt salt rounds

  try {
      // Hash the random password before storing
      const hashedPassword = await bcrypt.hash(randomPassword, saltRounds);

      // Store hashed password in the database
      await db.promise().query(
        "INSERT INTO faculty_login ( email, password,role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE password = VALUES(password)",
        [email, hashedPassword, role || "faculty"]
    );

      // Send the credentials via email
      await sendCredentials(email, email, randomPassword);

      res.status(200).json({ message: "✅ Credentials sent successfully!" });
  } catch (error) {
      console.error("❌ Error processing request:", error);
      res.status(500).json({ message: "❌ Error sending credentials." });
  }
});

app.post('/login', async (req, res) => {
  const { email, password, role } = req.body;
  console.log("🔹 Login attempt:", { email, role });

  if (!email || !password || !role) {
    console.error("❌ Missing credentials:", { email, password, role });
    return res.status(400).json({ error: "Email, password, and role are required." });
  }

  // Hardcoded credentials for admin and coordinator
  const adminEmail = "gvithalani8@gmail.com";
  const adminPassword = "Admin@123";
  const coordinatorEmail = "coordinator@example.com";
  const coordinatorPassword = "123";

  try {
    // ✅ Admin Login
    if (role.toLowerCase() === "admin" && email === adminEmail && password === adminPassword) {
      const token = jwt.sign({ email, role: "admin" }, SECRET_KEY, { expiresIn: "2h" });

      console.log("✅ Admin token generated:", token);
      res.cookie("auth_token", token, { httpOnly: true, secure: false, maxAge: 2 * 60 * 60 * 1000 });

      return res.json({ token, role: "admin", redirectUrl: "/admindash" });
    }

    // ✅ Coordinator Login
    if (role.toLowerCase() === "coordinator" && email === coordinatorEmail && password === coordinatorPassword) {
      const token = jwt.sign({ email, role: "coordinator" }, SECRET_KEY, { expiresIn: "2h" });

      console.log("✅ Coordinator token generated:", token);
      res.cookie("auth_token", token, { httpOnly: true, secure: false, maxAge: 2 * 60 * 60 * 1000 });

      return res.json({ token, role: "coordinator", redirectUrl: "/coordinatordash" });
    }

    // ✅ Faculty Login with Database Check
    if (role.toLowerCase() === "faculty") {
      const [users] = await db.promise().execute(
        "SELECT * FROM faculty_login WHERE email = ?", [email]
      );

      if (users.length === 0) {
        console.error("❌ Faculty not found:", email);
        return res.status(404).json({ error: "Invalid email or password." });
      }

      const user = users[0];

      // 🔹 Compare entered password with stored hashed password
      const passwordMatch = await bcrypt.compare(password, user.password);

      if (!passwordMatch) {
        console.error("❌ Incorrect password for:", email);
        return res.status(401).json({ error: "Invalid email or password." });
      }

      // 🔹 If password matches, generate a token
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        SECRET_KEY,
        { expiresIn: "8h" }
      );

      console.log("✅ Faculty login successful. Token generated:", token);
      res.cookie("auth_token", token, { httpOnly: true, secure: false, maxAge: 8 * 60 * 60 * 1000 });

      return res.json({ token, role: user.role, redirectUrl: "/faculty-dashboard" });
    }

    console.error("❌ Invalid role provided:", role);
    return res.status(400).json({ error: "Invalid role provided." });

  } catch (error) {
    console.error("❌ Login Error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
});





app.get("/studentdata", authenticateToken, async (req, res) => {
  try {
      const username = req.user.email; // Extract faculty username from token

      if (!username) {
          return res.status(400).json({ error: "Username missing from token" });
      }

      
      const [facultyResult] = await db.promise().query(
          `SELECT faculty_id FROM faculty WHERE email = ?`, 
          [username]
      );

      if (facultyResult.length === 0) {
          return res.status(404).json({ error: "Faculty not found" });
      }

      const facultyId = facultyResult[0].faculty_id; // Extract faculty_id

      // Check if PRN is provided in the query
      if (req.query.prn) {
          const prn = req.query.prn;
          const query = `
              SELECT 
                  s.student_name, 
                  sk.skill_name, 
                  q.Question, 
                  r.Result, 
                  DATE_FORMAT(r.conducted_date, '%Y-%m-%d') AS conducted_date,
                  r.totaltime,
                  r.Qno  -- Include Qno in the response
              FROM results r
              JOIN skills sk ON r.skill_id = sk.skill_id
              JOIN students s ON r.student_id = s.student_id
              JOIN evaluation_questions q ON r.Qno = q.Qno AND r.skill_id = q.skill_id  
              WHERE r.faculty_id = ? AND s.student_id = ?;
          `;

          try {
              const [filteredResults] = await db.promise().query(query, [facultyId, prn]);

              // Calculate total time taken
              const totalTimeTaken = filteredResults.length > 0 ? filteredResults[0].totaltime : 0;

              return res.json({ filteredResults, totalTimeTaken });
          } catch (err) {
              console.error("Error fetching student data for PRN:", err);
              return res.status(500).json({ error: "Error fetching data" });
          }
      }

      // Fetch available PRNs if no PRN is provided
      const prnQuery = `SELECT DISTINCT student_id FROM results WHERE faculty_id = ?;`;
      try {
          const [prnRows] = await db.promise().query(prnQuery, [facultyId]);
          const availablePRNs = prnRows.map(row => row.student_id);
          res.render("studentdata", { availablePRNs, studentData: [] });
      } catch (error) {
          console.error("Error fetching available PRNs:", error);
          res.status(500).send("Error fetching data");
      }
  } catch (error) {
      console.error("Unexpected error in /studentdata:", error);
      res.status(500).json({ error: "Internal server error" });
  }
});




app.post("/send-credentials-all", async (req, res) => {
  try {
      // Fetch all faculty emails and IDs
      const [facultyList] = await db.promise().query("SELECT email FROM faculty");

      if (facultyList.length === 0) {
          return res.status(404).json({ message: "❌ No faculty members found." });
      }

      let successCount = 0, failureCount = 0;

      // Loop through each faculty member and send credentials
      for (const faculty of facultyList) {
          const randomPassword = Math.random().toString(36).slice(-8);
          const hashedPassword = await bcrypt.hash(randomPassword, 10);

          try {
              // Store the hashed password in the database
              await db.promise().query(
                "INSERT INTO faculty_login (email, password, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE password = VALUES(password)",
                [faculty.email, hashedPassword, faculty.role]
              );
              

              // Send email
              await sendCredentials(faculty.email, faculty.role, randomPassword);
              successCount++;
          } catch (error) {
              console.error(`❌ Failed for ${faculty.email}:`, error);
              failureCount++;
          }
      }

      res.json({
          message: `✅ Sent credentials to ${successCount} faculty members. ❌ Failed for ${failureCount}.`
      });
  } catch (error) {
      console.error("❌ Error fetching faculty data:", error);
      res.status(500).json({ message: "❌ Error sending credentials to all." });
  }
});

app.get('/getSkills', async (req, res) => {
  try {
      const [rows] = await db.promise().query('SELECT DISTINCT skill_name FROM skills');

      if (rows.length === 0) {
          console.log("ℹ No skills found in the database.");
      }

      console.log("✅ Skills fetched:", rows); // Debugging log

      const skills = rows.map(row => row.skill_name); // Extract skills
      res.json({ skills });
  } catch (error) {
      console.error('❌ Error fetching skills:', error);
      res.status(500).json({ error: 'Error fetching skills' });
  }
});








app.get("/faculty-dashboard", authenticateToken, (req, res) => {
    
  if (req.user.role.toLowerCase() !== "faculty") {
      return res.status(403).send("Access denied. Only faculty can view this page.");
  }
  res.render("faculty-dashboard");
});

app.get('/form', (req, res) => {
  try {
      res.render('form'); // Just render the form without any data
  } catch (error) {
      console.error(error);
      res.status(500).send('Error rendering form');
  }
});

app.get("/viewfacultyadmin", authenticateToken, async (req, res) => {
  console.log("✅ Checking access for:", req.user);

  if (!req.user || req.user.role !== "admin") {
      console.log("❌ Unauthorized access attempt by:", req.user);
      return res.redirect("/login");
  }

  try {
      const [facultyList] = await db.promise().query("SELECT faculty_id, faculty_name, email, department FROM faculty");
      console.log("✅ Faculty list loaded successfully.");
      res.render("viewfacultyadmin", { facultyList, user: req.user }); // ✅ Pass user to EJS
  } catch (error) {
      console.error("❌ Error fetching faculty data:", error);
      res.status(500).send("❌ Error fetching faculty data.");
  }
});





app.get('/getStudentDetails/:student_id', async (req, res) => {
  const student_id = req.params.student_id;

  try {
      const [student] = await db.promise().query("SELECT * FROM students WHERE student_id = ?", [student_id]);

      if (student.length === 0) {
          return res.status(404).json({ error: 'Student not found' });
      }

      res.json(student[0]);
  } catch (error) {
      console.error("❌ Error fetching student details:", error);
      res.status(500).json({ error: 'Error fetching student details' });
  }
});
app.get('/students', (req, res) => {
  const query = 'SELECT student_id, student_name, semester FROM students';

  db.query(query, (err, results) => {
      if (err) {
          console.error('Database query error:', err);
          res.status(500).send('Database error');
      } else {
          console.log('Database Results:', results); // ✅ DEBUG: Print data
          res.render('studentdata', { studentList: results }); // Pass data to EJS
      }
  });
});


app.post("/upload-student", upload.single("studentFile"), async (req, res) => {
  if (!req.file) return res.status(400).send("❌ Please upload an Excel file.");

  const filePath = path.join(__dirname, "uploads", req.file.filename);
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  let studentData = xlsx.utils.sheet_to_json(sheet);

  if (!studentData || studentData.length === 0) return res.status(400).send("❌ No student data found in the uploaded file.");

  // 🔹 Normalize column names
  studentData = studentData.map(row => {
    return _.mapKeys(row, (value, key) => 
      key.trim().toLowerCase().replace(/\s+/g, "")
    );
  });

  console.log("📊 First row after cleaning:", studentData[0]); // Debugging

  try {
    const values = studentData
      .filter(student => 
        student.student_id !== undefined && 
        student.student_name !== undefined && 
        student.email !== undefined
      )
      .map(student => [
        String(student.student_id).trim(),  // Convert to string and trim
        String(student.student_name).trim(),
        String(student.email).trim(),
        student.year || null,
        student.institute || null
      ]);

    console.log("✅ Extracted Student IDs:", values.map(row => row[0])); // Debugging

    if (values.length > 0) {
      const [result] = await db.promise().query(
        "INSERT INTO students (student_id, student_name, email, year, institute) VALUES ?",
        [values]
      );

      return res.send(result.affectedRows > 0 ? "✅ Student data uploaded successfully!" : "❌ No student data was inserted.");
    } else {
      return res.status(400).send("❌ No valid student data found in the uploaded file.");
    }
  } catch (error) {
    console.error("❌ Error inserting student data:", error);
    res.status(500).send("❌ Error processing student data.");
  }
});




// Update viewstudent route
app.get("/viewstudent", authenticateToken, async (req, res) => {
  try {
      const [students] = await db.promise().query(
          "SELECT student_id, student_name, email, year, institute FROM students"
      );
      // Pass req.user into the view as "user"
      res.render("viewstudent", { students, user: req.user });
  } catch (err) {
      console.error("Error fetching student data:", err);
      res.status(500).send("Error fetching student data.");
  }
});

app.get("/viewstudentadmin", authenticateToken, async (req, res) => {
  console.log("✅ Checking access for:", req.user); // Debugging line

  if (!req.user || req.user.role !== "admin") {
    console.log("❌ Unauthorized access attempt by:", req.user);
    return res.redirect("/login");
  }

  try {
      const [students] = await db.promise().query(
          "SELECT student_id, student_name, email, year, institute FROM students"
      );

      console.log("✅ Student list loaded successfully.");
      res.render("viewstudentadmin", { students, user: req.user }); // ✅ Pass user correctly
  } catch (err) {
      console.error("❌ Error fetching student data:", err);
      res.status(500).send("❌ Error fetching student data.");
  }
});


// Update student route
app.post('/update-student', async (req, res) => {
  const { student_id, student_name, email, year, institute } = req.body;
  try {
      await db.promise().query(
          'UPDATE students SET student_name = ?, email = ?, year = ?, institute = ? WHERE student_id = ?',
          [student_name, email, year, institute, student_id]
      );
      res.send('✅ Student updated successfully!');
  } catch (err) {
      console.error(err);
      res.status(500).send('❌ Error updating student.');
  }
});

// Delete single student
app.delete('/delete-student/:id', (req, res) => {
  const studentID = req.params.id;
  db.query('DELETE FROM students WHERE student_id = ?', [studentID], (err) => {
    if (err) return res.status(500).send('Failed to delete student');
    res.send('Student deleted successfully');
  });
});



// Delete selected students
app.post('/delete-selected', (req, res) => {
  const { student_ids } = req.body;
  if (student_ids.length === 0) return res.status(400).send('No students selected');

  const placeholders = student_ids.map(() => '?').join(',');
  db.query(`DELETE FROM students WHERE student_id IN (${placeholders})`, student_ids, (err) => {
    if (err) return res.status(500).send('Failed to delete selected students');
    res.send('Selected students deleted successfully');
  });
});

// Delete all students
app.delete('/delete-all', (req, res) => {
  db.query('DELETE FROM students', (err) => {
    if (err) return res.status(500).send('Failed to delete all students');
    res.send('All students deleted successfully');
  });
});


app.post("/upload-faculty", upload.single("facultyFile"), async (req, res) => {
  if (!req.file) {
      return res.status(400).send("❌ Please upload an Excel file.");
  }

  const filePath = path.join(__dirname, "uploads", req.file.filename);
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const facultyData = xlsx.utils.sheet_to_json(sheet);

  if (!facultyData || facultyData.length === 0) {
      return res.status(400).send("❌ No faculty data found in the uploaded file.");
  }

  try {
      const values = facultyData
          .filter(faculty => faculty.Faculty_ID && faculty.email) // Ensure required fields
          .map(faculty => [
              faculty.Faculty_ID,
              faculty.faculty_name || null,   // Handle optional fields
              faculty.department || null,
              faculty.email
          ]);

      if (values.length > 0) {
          const [result] = await db.promise().query(
              "INSERT INTO faculty (faculty_id, faculty_name, department, email) VALUES ?",
              [values]
          );

          if (result.affectedRows > 0) {
              return res.send("✅ Faculty data uploaded successfully!");
          } else {
              return res.status(400).send("❌ No faculty data was inserted. Check your file content.");
          }
      } else {
          return res.status(400).send("❌ No valid faculty data found in the uploaded file.");
      }
  } catch (error) {
      console.error("❌ Error inserting faculty data:", error);
      res.status(500).send("❌ Error processing faculty data.");
  }
});

app.get("/viewfaculty", async (req, res) => {
  try {
      const [facultyList] = await db.promise().query("SELECT faculty_id, email FROM faculty");

      console.log("Retrieved Faculty List:", facultyList);
console.log("Type of facultyList:", typeof facultyList, Array.isArray(facultyList));


      res.render("viewfaculty", { facultyList });
  } catch (error) {
      console.error("❌ Error fetching faculty data:", error);
      res.status(500).send("❌ Error fetching faculty data.");
  }
});

// View faculty route
app.get("/viewfacultycoord", authenticateToken, async (req, res) => {
  // Now req.user is set from the token
  const user = req.user;
  if (!user || user.role.toLowerCase() !== "coordinator") {
    return res.redirect("/login"); // Redirect if not logged in or unauthorized
  }
  try {
    const [facultyList] = await db.promise().query(`
      SELECT f.faculty_id, f.faculty_name, f.department, f.email, 
        CASE 
          WHEN fl.password IS NOT NULL THEN '✅ Credentials Sent'
          ELSE '❌ No Credentials Sent'
        END AS credentials_status
      FROM faculty f
      LEFT JOIN faculty_login fl ON f.email = fl.email
    `);
    res.render("viewfacultycoord", { user, facultyList });
  } catch (error) {
    console.error("❌ Error fetching faculty data:", error);
    res.status(500).send("❌ Error fetching faculty data.");
  }
});

// Update faculty route
app.put("/update-faculty", async (req, res) => {
  try {
      let { faculty_id, faculty_name, department, email } = req.body;

      if (!faculty_id || !faculty_name || !email) {
          return res.status(400).json({ success: false, message: "❌ Faculty ID, Name, and Email are required." });
      }

      department = department || "N/A";

      // 🔹 Find the old email before updating
      const [faculty] = await db.promise().query(
          "SELECT email FROM faculty WHERE faculty_id = ?", [faculty_id]
      );

      if (faculty.length === 0) {
          return res.status(404).json({ success: false, message: "❌ Faculty not found." });
      }

      const oldEmail = faculty[0].email;

      // 🔹 First update the faculty table
      const [result] = await db.promise().query(
          "UPDATE faculty SET faculty_name = ?, department = ?, email = ? WHERE faculty_id = ?",
          [faculty_name, department, email, faculty_id]
      );

      // 🔹 Then update the faculty_login table
      await db.promise().query(
          "UPDATE faculty_login SET email = ? WHERE email = ?",
          [email, oldEmail]
      );

      if (result.affectedRows > 0) {
          console.log(`✅ Faculty ID ${faculty_id} updated successfully.`);
          res.json({ success: true, message: "✅ Faculty record updated successfully!" });
      } else {
          console.warn(`❌ No updates for Faculty ID ${faculty_id}.`);
          res.status(404).json({ success: false, message: "❌ Faculty not found or no changes made." });
      }
  } catch (error) {
      console.error("❌ Error updating faculty record:", error);
      res.status(500).json({ success: false, message: "❌ Error updating faculty record." });
  }
});





// Delete faculty route
app.delete("/delete-faculty/:faculty_id/:email", async (req, res) => {
  const { faculty_id, email } = req.params;

  try {
      // Delete from faculty_login first to prevent foreign key constraint error
      await db.promise().query("DELETE FROM faculty_login WHERE email = ?", [email]);

      // Now delete from faculty
      const [result] = await db.promise().query(
          "DELETE FROM faculty WHERE faculty_id = ? AND email = ?",
          [faculty_id, email]
      );

      if (result.affectedRows > 0) {
          res.send("✅ Faculty deleted successfully!");
      } else {
          res.status(404).send("❌ Faculty not found.");
      }
  } catch (error) {
      console.error("❌ Error deleting faculty:", error);
      res.status(500).send("❌ Error deleting faculty.");
  }
});


// Delete all faculty
app.delete("/delete-all-faculty", async (req, res) => {
  try {
      // Delete all faculty login records first
      await db.promise().query("DELETE FROM faculty_login");

      // Now delete all faculty records
      const [result] = await db.promise().query("DELETE FROM faculty");

      if (result.affectedRows > 0) {
          res.send("✅ All faculty records deleted successfully!");
      } else {
          res.status(404).send("❌ No faculty records found to delete.");
      }
  } catch (error) {
      console.error("❌ Error deleting all faculty records:", error);
      res.status(500).send("❌ Error deleting all faculty records.");
  }
});



app.delete("/delete-selected-faculty", async (req, res) => {
  const { selectedFaculty } = req.body;

  if (!selectedFaculty || selectedFaculty.length === 0) {
    return res.status(400).json({ message: "❌ No faculty selected for deletion." });
  }

  try {
    // Delete from faculty_login first
    const emailList = selectedFaculty.map(faculty => faculty.email);
    await db.promise().query("DELETE FROM faculty_login WHERE email IN (?)", [emailList]);

    // Now delete from faculty
    const whereClause = selectedFaculty.map(() => "(email = ?)").join(" OR ");
    const values = selectedFaculty.flatMap(faculty => [faculty.email]);

    const [result] = await db.promise().query(
      `DELETE FROM faculty WHERE ${whereClause}`,
      values
    );

    if (result.affectedRows > 0) {
      return res.json({ message: "✅ Selected faculty records deleted successfully!" });
    } else {
      return res.status(404).json({ message: "❌ No matching faculty records found." });
    }
  } catch (error) {
    console.error("❌ Error deleting selected faculty records:", error);
    return res.status(500).json({ message: "❌ Error deleting selected faculty records." });
  }
});







app.get("/result", async (req, res) => {
  try {
      // Fetch all student IDs
      const [students] = await db.promise().query("SELECT student_id FROM students");
      const studentIdList = students.map(student => student.student_id);

      // Get student_id from query parameters
      const studentId = req.query.student_id || null;
      let results = [];

      // Fetch results only if studentId is provided
      if (studentId) {
          [results] = await db.promise().query(`
              SELECT 
                  s.student_name, 
                  sk.skill_name, 
                  q.Question, 
                  r.Result 
              FROM results r
              JOIN skills sk ON r.skill_id = sk.skill_id
              JOIN students s ON r.student_id = s.student_id
              JOIN evaluation_questions q ON r.Qno = q.Qno AND r.skill_id = q.skill_id  
              WHERE s.student_id = ?;
          `, [studentId]);
      }

      res.render('viewresult', { studentIdList, studentId, results });
  } catch (error) {
      console.error("❌ Error fetching results:", error);
      res.status(500).send("❌ Error fetching results.");
  }
}); 

// Backend Routes for Faculty-Student and Faculty-Skill Mapping

app.get('/viewmapping', (req, res) => {
  const query1 = 'SELECT * FROM faculty_student_mapping';
  const query2 = 'SELECT * FROM faculty_skill_mapping';

  db.query(query1, (err, studentResults) => {
      if (err) throw err;

      db.query(query2, (err, skillResults) => {
          if (err) throw err;

          res.render('viewmapping', {
              facultyStudentMapping: studentResults,
              facultySkillMapping: skillResults
          });
      });
  });
});
// Delete a single student mapping
app.post('/delete-student-viewmapping/:id', (req, res) => {
  const id = req.params.id;
  const query = 'DELETE FROM faculty_student_mapping WHERE id = ?';

  db.query(query, [id], (err, result) => {
      if (err) {
          console.error("Error deleting student mapping:", err);
          return res.status(500).json({ message: "Failed to delete student mapping" });
      }
      res.json({ message: "Student mapping deleted successfully", affectedRows: result.affectedRows });
  });
});

// Delete a single skill mapping
app.post('/delete-skill-viewmapping/:id', (req, res) => {
  const id = req.params.id;
  const query = 'DELETE FROM faculty_skill_mapping WHERE id = ?';

  db.query(query, [id], (err, result) => {
      if (err) {
          console.error("Error deleting skill mapping:", err);
          return res.status(500).json({ message: "Failed to delete skill mapping" });
      }
      res.json({ message: "Skill mapping deleted successfully", affectedRows: result.affectedRows });
  });
});

// Delete selected student mappings
app.post('/delete-selected-student-viewmapping', (req, res) => {
  const ids = req.body.ids;
  if (!ids || ids.length === 0) {
      return res.status(400).json({ message: "No records selected" });
  }

  const query = 'DELETE FROM faculty_student_mapping WHERE id IN (?)';
  db.query(query, [ids], (err, result) => {
      if (err) {
          console.error("Error deleting selected student mappings:", err);
          return res.status(500).json({ message: "Failed to delete selected student mappings" });
      }
      res.json({ message: "Selected student mappings deleted successfully", affectedRows: result.affectedRows });
  });
});

// Delete selected skill mappings
app.post('/delete-selected-skill-viewmapping', (req, res) => {
  const ids = req.body.ids;
  if (!ids || ids.length === 0) {
      return res.status(400).json({ message: "No records selected" });
  }

  const query = 'DELETE FROM faculty_skill_mapping WHERE id IN (?)';
  db.query(query, [ids], (err, result) => {
      if (err) {
          console.error("Error deleting selected skill mappings:", err);
          return res.status(500).json({ message: "Failed to delete selected skill mappings" });
      }
      res.json({ message: "Selected skill mappings deleted successfully", affectedRows: result.affectedRows });
  });
});

// Delete all student mappings
app.post('/delete-all-student-viewmapping', (req, res) => {
  const query = 'DELETE FROM faculty_student_mapping';
  db.query(query, (err, result) => {
      if (err) {
          console.error("Error deleting all student mappings:", err);
          return res.status(500).json({ message: "Failed to delete all student mappings" });
      }
      res.json({ message: "All student mappings deleted successfully", affectedRows: result.affectedRows });
  });
});

// Delete all skill mappings
app.post('/delete-all-skill-viewmapping', (req, res) => {
  const query = 'DELETE FROM faculty_skill_mapping';
  db.query(query, (err, result) => {
      if (err) {
          console.error("Error deleting all skill mappings:", err);
          return res.status(500).json({ message: "Failed to delete all skill mappings" });
      }
      res.json({ message: "All skill mappings deleted successfully", affectedRows: result.affectedRows });
  });
});




app.get("/forgot-password", (req,res) => res.render("forgot-password"));

app.post("/submit-mapping", upload.single("studentFile"), async (req, res) => {
  if (!req.file) return res.status(400).send("❌ No file uploaded.");

  const filePath = path.join(__dirname, "uploads", req.file.filename);
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet);

  if (!rows.length) return res.status(400).send("❌ Empty file uploaded.");

  try {
    const facultyIds = new Set();
    const studentIds = new Set();
    const facultySkillInsertQueries = [];
    const facultyStudentInsertQueries = [];
    let currentSkillId = null;

    // 🔹 Convert extracted IDs to strings
    for (const row of rows) {
      const faculty_id = row["Faculty ID"] ? String(row["Faculty ID"]).trim() : null;
      const skill_id = row["Form Access"] ? String(row["Form Access"]).trim() : null;
      const student_id = row["Student ID"] ? String(row["Student ID"]).trim() : null;

      if (faculty_id) {
        facultyIds.add(faculty_id);
      }

      if (skill_id) {
        currentSkillId = skill_id;
      }

      if (student_id) {
        studentIds.add(student_id);
      }

      if (faculty_id && skill_id) {
        facultySkillInsertQueries.push([faculty_id, skill_id]);
      }

      if (faculty_id && student_id && skill_id) {
        facultyStudentInsertQueries.push([faculty_id, student_id, skill_id]);
      }
    }

    console.log("✅ Extracted Faculty IDs:", Array.from(facultyIds));
    console.log("✅ Extracted Student IDs:", Array.from(studentIds));

    // 🔹 Convert faculty IDs to strings before querying
    const [existingFaculty] = await db.promise().query(
      "SELECT faculty_id FROM faculty WHERE faculty_id IN (?)",
      [Array.from(facultyIds).map(id => String(id))]
    );
    const foundFacultyIds = new Set(existingFaculty.map(row => String(row.faculty_id)));

    // 🔹 Convert student IDs to strings before querying
    const [existingStudents] = await db.promise().query(
      "SELECT student_id FROM students WHERE student_id IN (?)",
      [Array.from(studentIds).map(id => String(id))]
    );
    const foundStudentIds = new Set(existingStudents.map(row => String(row.student_id)));

    console.log("✅ Found Faculty IDs in DB:", Array.from(foundFacultyIds));
    console.log("✅ Found Student IDs in DB:", Array.from(foundStudentIds));

    // Identify missing Faculty and Student IDs
    const missingFaculty = [...facultyIds].filter(id => !foundFacultyIds.has(id));
    const missingStudents = [...studentIds].filter(id => !foundStudentIds.has(id));

    if (missingFaculty.length || missingStudents.length) {
      console.log("❌ Missing Faculty:", missingFaculty);
      console.log("❌ Missing Students:", missingStudents);

      return res.status(400).json({
        message: "❌ Some faculty or students do not exist in the database.",
        missingFaculty,
        missingStudents
      });
    }

    // 🔹 Insert Data if Validation Passed
    if (facultySkillInsertQueries.length > 0) {
      await db.promise().query(
        "INSERT IGNORE INTO faculty_skill_mapping (faculty_id, skill_id) VALUES ?",
        [facultySkillInsertQueries]
      );
    }

    if (facultyStudentInsertQueries.length > 0) {
      await db.promise().query(
        "INSERT IGNORE INTO faculty_student_mapping (faculty_id, student_id, skill_id) VALUES ?",
        [facultyStudentInsertQueries]
      );
    }

    res.send("✅ Mapping uploaded successfully!");
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).send("❌ Error processing file.");
  }
});


// Let me know if you want to add more validations or optimize this further! 🚀




app.get("/logout", (req, res) => {
  req.session.destroy(err => {
      if (err) {
          console.error("❌ Error logging out:", err);
          return res.status(500).send("❌ Logout error.");
      }
      res.redirect("/login");
  });
});


app.get("/viewforms", authenticateToken, (req, res) => {
  if (req.user.role.toLowerCase() !== "faculty") {
      return res.status(403).send("Access denied.");
  }
  res.render("viewforms");
});
                                                                  
// API: Get Faculty Name based on token (using email from token)
app.get('/getFacultyName', async (req, res) => {
  try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return res.status(401).json({ error: "Unauthorized: Token missing or malformed" });
      }
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, SECRET_KEY);
      if (!decoded.email) {
          return res.status(400).json({ error: "Invalid token: Email not found" });
      }
      const email = decoded.email;
      const [rows] = await db.promise().execute(`
        SELECT faculty_name 
        FROM faculty 
        WHERE email = ?
    `, [email]);
    


      if (rows.length === 0) {
          return res.status(404).json({ error: "Faculty not found" });
      }
      res.json({ facultyName: rows[0].faculty_name });
  } catch (error) {
      console.error("Error fetching faculty name:", error);
      if (error.name === "JsonWebTokenError") {
          return res.status(401).json({ error: "Invalid token" });
      } else if (error.name === "TokenExpiredError") {
          return res.status(401).json({ error: "Token expired" });
      }
      res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/form', (req, res) => {
  try {
      res.render('form'); // Just render the form without any data
  } catch (error) {
      console.error(error);
      res.status(500).send('Error rendering form');
  }
});


app.get('/getFacultySkills', authenticateToken, async (req, res) => {
  try {
    const username = req.user.email; // Extract username from the token

    if (!username) {
      return res.status(400).json({ error: "Username missing from token" });
    }

    const [facultyResult] = await db.promise().query(
      `SELECT faculty_id FROM faculty WHERE email = ?`,
      [username]
    );

    if (facultyResult.length === 0) {
      return res.status(404).json({ error: "Faculty not found" });
    }

    const facultyId = facultyResult[0].faculty_id; // Extract faculty_id

    // Fetch skills based on faculty_id using promise() as well
    const [skills] = await db.promise().query(
      `SELECT s.skill_id, s.skill_name 
       FROM faculty_skill_mapping fsm
       JOIN skills s ON fsm.skill_id = s.skill_id
       WHERE fsm.faculty_id = ?`, 
      [facultyId]
    );

    res.json(skills);
  } catch (error) {
    console.error("❌ Error fetching faculty skills:", error);
    res.status(500).json({ error: "Failed to fetch skills" });
  }
});



app.get('/getStudentsBySkill/:skill_id', authenticateToken, async (req, res) => {
  try {
    const skillId = req.params.skill_id;
    const username = req.user.email; // Extract faculty username from token

    if (!username) {
      return res.status(400).json({ error: "Username missing from token" });
    }

    // Query faculty table for the faculty_id
    const [facultyResult] = await db.promise().query(
      `SELECT faculty_id FROM faculty WHERE email = ?`,
      [username]
    );

    if (facultyResult.length === 0) {
      return res.status(404).json({ error: "Faculty not found" });
    }

    const facultyId = facultyResult[0].faculty_id; // Extract faculty_id

    // Fetch students mapped to this faculty for the selected skill
    const [students] = await db.promise().query(
      `SELECT s.student_id, s.student_name
       FROM faculty_student_mapping fsm
       JOIN students s ON fsm.student_id = s.student_id
       WHERE fsm.faculty_id = ? AND fsm.skill_id = ?`,
      [facultyId, skillId]
    );

    res.json(students);
  } catch (error) {
    console.error("❌ Error fetching students for selected skill:", error);
    res.status(500).json({ error: "Failed to fetch students" });
  }
});




app.get('/fetch-questions/:skillId', async (req, res) => {
  try {
    const [rows] = await db.promise().execute(
      'SELECT * FROM evaluation_questions WHERE skill_id = ?', 
      [req.params.skillId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Error fetching questions' });
  }
});




app.post('/submit-results', authenticateToken, async (req, res) => {
  const results = req.body.results;
  try {
    const username = req.user.email; // Extract username from the token

    if (!username) {
      return res.status(400).json({ error: "Username missing from token" });
    }

    // Use db.promise().query and enclose the query in backticks.
    const [facultyResult] = await db.promise().query(
      `SELECT faculty_id FROM faculty WHERE email = ?`, 
      [username]
    );

    if (facultyResult.length === 0) {
      return res.status(404).json({ error: "Faculty not found" });
    }

    const faculty_id = facultyResult[0].faculty_id; // Extract faculty_id

    for (const result of results) {
      const { student_id, skill_id, Qno, Result, totaltime, conducted_time, conducted_date } = result;

      const query = `
        INSERT INTO Results (student_id, faculty_id, skill_id, Qno, totaltime, conducted_time, Result, conducted_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await db.promise().query(query, [student_id, faculty_id, skill_id, Qno, totaltime, conducted_time, Result, conducted_date]);
    }

    res.status(200).json({ message: "Results successfully saved!" });
  } catch (error) {
    console.error("Error inserting results:", error);
    res.status(500).json({ error: "Failed to save results" });
  }
});

app.put("/updateStudentData", async (req, res) => {
  const { prn, updatedAnswers, totaltime } = req.body;

  try {
      if (!Array.isArray(updatedAnswers) || updatedAnswers.length === 0) {
          return res.status(400).json({ message: "No answers provided" });
      }

      const conductedDate = updatedAnswers.length > 0 ? updatedAnswers[0].conducted_date : null;
      if (!conductedDate) {
          return res.status(400).json({ message: "Conducted date is missing" });
      }

      for (const answer of updatedAnswers) {
          await db.promise().query(
              "UPDATE results SET Result = ? WHERE student_id = ? AND qno = ? AND conducted_date = ?;",
              [answer.result, prn, answer.qno, conductedDate]
          );
      }

      if (totaltime && typeof totaltime[conductedDate] !== "undefined") {
          const totalTimeValue = totaltime[conductedDate];

          await db.promise().query(
              "UPDATE results SET totaltime = ? WHERE student_id = ? AND conducted_date = ?;",
              [totalTimeValue, prn, conductedDate]
          );
      }

      res.status(200).json({ message: "Student data updated successfully" });
  } catch (error) {
      res.status(500).json({ message: "Internal Server Error" });
  }
});




app.get('/student-details/:prn', async (req, res) => {
  try {
      const prn = req.params.prn;
      const [result] = await db.execute(`
          SELECT student_name, semester
          FROM students
          WHERE student_id = ?;
      `, [prn]);
      if (result.length > 0) {
          const student = result[0];
          res.json(student);
      } else {
          res.status(404).json({ message: 'Student not found' });
      }
  } catch (error) {
      console.error(error);
      res.status(500).send('Error fetching student details');
  }
});






async function getNextSkillId() {
    try {
        const [rows] = await db.promise().query('SELECT MAX(skill_id) AS max_id FROM skills');
        return (rows[0].max_id || 0) + 1;
    } catch (error) {
        console.error("Error getting next skill ID:", error);
        throw error;
    }
}

app.post('/add-skill', upload.single('questionFile'), async (req, res) => {
    const { skillName } = req.body;
    const filePath = req.file?.path;

    if (!skillName || !filePath) {
        return res.status(400).send('Skill name and Excel file are required.');
    }

    try {
        const skillId = await getNextSkillId();

        // ✅ Use db.promise().query() for async support
        await db.promise().query('INSERT INTO skills (skill_id, skill_name) VALUES (?, ?)', [skillId, skillName]);

        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        for (let row of sheetData) {
            if (row.Qno && row.Question) {
                await db.promise().query(
                    'INSERT INTO evaluation_questions (Qno, Question, skill_id) VALUES (?, ?, ?)',
                    [row.Qno, row.Question, skillId]
                );
            }
        }

        fs.unlinkSync(filePath);
        res.send('Skill and questions added successfully.');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

app.get("/api/skills", async (req, res) => {
  try {
    const [rows] = await db.promise().query("SELECT * FROM skills");
    res.json(rows); // e.g. [{skill_id:1, skill_name:'Skill One'}, ...]
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching skills" });
  }
});

app.get("/api/evaluation-questions", async (req, res) => {
  const skillId = req.query.skill_id;
  if (!skillId) {
    return res.status(400).json({ message: "skill_id is required" });
  }

  try {
    const [rows] = await db.promise().query(
      "SELECT Qno, Question, skill_id FROM evaluation_questions WHERE skill_id = ?",
      [skillId]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching questions" });
  }
});












app.post("/api/evaluation-questions", async (req, res) => {
  const { qno, question, skill_id } = req.body;

  // Validate input
  if (!qno || !question || !skill_id) {
    return res
      .status(400)
      .json({ message: "qno, question, and skill_id are required" });
  }

  try {
    // Insert question with user-supplied Qno
    const [result] = await db.promise().query(
      "INSERT INTO evaluation_questions (Qno, Question, skill_id) VALUES (?, ?, ?)",
      [qno, question, skill_id]
    );

    res.json({ message: "Question added successfully" });
  } catch (error) {
    console.error("Error adding question:", error);
    res.status(500).json({ message: "Failed to add question" });
  }
});

app.put("/api/evaluation-questions/:oldQno", async (req, res) => {
  const { oldQno } = req.params;
  const { newQno, question } = req.body;

  if (!newQno || !question) {
    return res
      .status(400)
      .json({ message: "newQno and question are required" });
  }

  try {
    // Update Qno and Question
    const [result] = await db.promise().query(
      "UPDATE evaluation_questions SET Qno = ?, Question = ? WHERE Qno = ?",
      [newQno, question, oldQno]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Question not found" });
    }

    res.json({ message: "Question updated successfully" });
  } catch (error) {
    console.error("Error editing question:", error);
    res.status(500).json({ message: "Failed to edit question" });
  }
});

// 5️⃣ DELETE A QUESTION
//    DELETE /api/evaluation-questions/:qno
app.delete("/api/evaluation-questions/:qno", async (req, res) => {
  const { qno } = req.params;

  try {
    const [result] = await db.promise().query(
      "DELETE FROM evaluation_questions WHERE Qno = ?",
      [qno]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Question not found" });
    }

    res.json({ message: "Question deleted successfully" });
  } catch (error) {
    console.error("Error deleting question:", error);
    res.status(500).json({ message: "Failed to delete question" });
  }
});








// 📌 Start Server
app.listen(3000, () => console.log("🚀 Server running on port 3000"));
