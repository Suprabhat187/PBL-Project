const express = require("express");
const ejsMate = require("ejs-mate");
const path = require("path");
const multer = require("multer");
const mysql = require('mysql2');
const xlsx = require("xlsx");
const fs = require("fs");
const db = require("./database");
const session = require("express-session");
require("dotenv").config();
const crypto = require("crypto");  
const { sendCredentials, sendCredentialsToAll} = require("./utils/email");
const cors = require("cors");
const bcrypt = require('bcrypt');
const _ = require("lodash");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Ensure the uploads folder exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Multer storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

// Initialize multer
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
app.use(cors());

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// 📌 Routes
app.get("/", (req, res) => res.render("coordinatordash"));
app.get("/addstudent", (req, res) => res.render("addstudent"));
app.get("/addfaculty", (req, res) => res.render("addfaculty"));
app.get("/mapping", (req, res) => res.render("mapping"));
app.get("/admindash", (req, res) => res.render("admindash"));
app.get("/coordinatordash", (req, res) => res.render("coordinatordash"));
app.get("/facultydata", (req, res) => res.render("facultydata"));
app.get("/studentdata", (req, res) => res.render("studentdata"));
app.get("/viewresult", (req, res) => res.render("viewresult"));
app.get("/addfacultyview", (req, res) => res.render("addfacultyview"));

app.get("/login", (req, res) => {
    res.render("login", { error: null });  // ✅ Always pass error variable
});
app.get("/viewdetails", async (req, res) => {
    try {
        const [students] = await db.promise().query("SELECT student_id FROM students");
        const studentIdList = students.map(student => student.student_id);
        res.render('viewdetails', { studentIdList });
    } catch (error) {
        console.error("❌ Error fetching student IDs:", error);
        res.status(500).send("❌ Error fetching student IDs.");
    }
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
        for (const faculty of facultyData) {
            const facultyId = faculty.Faculty_ID; // Ensure this column exists in your Excel file
            const facultyEmail = faculty.Faculty_email;

            if (!facultyId || !facultyEmail) continue;

            // Insert faculty ID into the database
            await db.promise().query(
              "INSERT INTO faculty (faculty_id, faculty_email) VALUES (?, ?) ON DUPLICATE KEY UPDATE faculty_email = VALUES(faculty_email)",
              [facultyId, facultyEmail]
            );
            
        }

        res.send("✅ Faculty data uploaded successfully!");
    } catch (error) {
        console.error("❌ Error inserting faculty data:", error);
        res.status(500).send("❌ Error processing faculty data.");
    }
});
app.get("/viewfaculty", async (req, res) => {
    try {
        const [facultyList] = await db.promise().query("SELECT faculty_id, faculty_email FROM faculty");

        console.log("Retrieved Faculty List:", facultyList);
console.log("Type of facultyList:", typeof facultyList, Array.isArray(facultyList));


        res.render("viewfaculty", { facultyList });
    } catch (error) {
        console.error("❌ Error fetching faculty data:", error);
        res.status(500).send("❌ Error fetching faculty data.");
    }
});

app.get("/viewfacultyadmin", async (req, res) => {
    try {
      const [facultyList] = await db.promise().query(`
        SELECT f.faculty_id, f.faculty_email, 
          CASE 
            WHEN fl.password_hash IS NOT NULL THEN '✅ Credentials Sent'
            ELSE '❌ No Credentials Sent'
          END AS credentials_status
        FROM faculty f
        LEFT JOIN faculty_login fl ON f.faculty_email = fl.email
      `);
  
      res.render("viewfacultyadmin", { facultyList });
    } catch (error) {
      console.error("❌ Error fetching faculty data:", error);
      res.status(500).send("❌ Error fetching faculty data.");
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

app.post("/send-credentials", async (req, res) => {
    console.log(req.body); // Debugging: Check received data
    const { facultyId, email } = req.body; 
  
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
          "INSERT INTO faculty_login (faculty_id, email, password_hash) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)",
          [facultyId, email, hashedPassword]
      );
  
        // Send the credentials via email
        await sendCredentials(email, email, randomPassword);
  
        res.status(200).json({ message: "✅ Credentials sent successfully!" });
    } catch (error) {
        console.error("❌ Error processing request:", error);
        res.status(500).json({ message: "❌ Error sending credentials." });
    }
  });

  app.post("/send-credentials-all", async (req, res) => {
    try {
        // Fetch all faculty emails and IDs
        const [facultyList] = await db.promise().query("SELECT faculty_id, faculty_email FROM faculty");
  
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
                    "INSERT INTO faculty_login (faculty_id, email, password_hash) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)",
                    [faculty.faculty_id, faculty.faculty_email, hashedPassword]
                );
  
                // Send email
                await sendCredentials(faculty.faculty_email, faculty.faculty_email, randomPassword);
                successCount++;
            } catch (error) {
                console.error(`❌ Failed for ${faculty.faculty_email}:`, error);
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



// Route to render form1 with student IDs
app.get('/form1', async (req, res) => {
    try {
        const [students] = await db.promise().query("SELECT student_id FROM students");
        const studentIdList = students.map(student => student.student_id);
        res.render('form1', { studentIdList });
    } catch (error) {
        console.error("❌ Error fetching student IDs:", error);
        res.status(500).send("❌ Error fetching student IDs.");
    }
});

app.get('/form2', async (req, res) => {
    try {
        const [students] = await db.promise().query("SELECT student_id FROM students");
        const studentIdList = students.map(student => student.student_id);
        res.render('form2', { studentIdList });
    } catch (error) {
        console.error("❌ Error fetching student IDs:", error);
        res.status(500).send("❌ Error fetching student IDs.");
    }
});

app.get('/form3', async (req, res) => {
    try {
        const [students] = await db.promise().query("SELECT student_id FROM students");
        const studentIdList = students.map(student => student.student_id);
        res.render('form3', { studentIdList });
    } catch (error) {
        console.error("❌ Error fetching student IDs:", error);
        res.status(500).send("❌ Error fetching student IDs.");
    }
});

app.get('/form4', async (req, res) => {
    try {
        const [students] = await db.promise().query("SELECT student_id FROM students");
        const studentIdList = students.map(student => student.student_id);
        res.render('form4', { studentIdList });
    } catch (error) {
        console.error("❌ Error fetching student IDs:", error);
        res.status(500).send("❌ Error fetching student IDs.");
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


// Route to fetch student details via AJAX
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
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const [result] = await db.promise().query(
            "SELECT * FROM coordinators WHERE username = ? AND password = ?",
            [username, password]
        );

        if (result.length > 0) {
            req.session.isAuthenticated = true;
            return res.redirect("/coordinatordash");
        } else {
            return res.render("login", { error: "❌ Invalid Credentials! Try Again." });
        }
    } catch (err) {
        console.error("❌ Login Error:", err);
        res.status(500).render("login", { error: "❌ Server Error. Please try again." });
    }
});


// Routes to handle form submissions
app.post('/submit-form1', async (req, res) => {
    try {
        if (!req.body) {
            console.error("❌ No request body received");
            return res.status(400).send("❌ Request body is required.");
        }

        // Extract required fields only
        const { student_id, date, ...tasks } = req.body;

        // Filter out unexpected fields
        const taskKeys = Object.keys(tasks).filter(key => key.startsWith('task') && !isNaN(key.replace('task', '')));
        taskKeys.sort((a, b) => parseInt(a.replace('task', '')) - parseInt(b.replace('task', '')));

        // Extract values
        let taskFields = taskKeys.map(key => tasks[key]);

        // Fill missing tasks with null
        while (taskFields.length < 17) {
            taskFields.push(null);
        }

        // Validate the number of tasks
        if (taskFields.length !== 17) {
            console.error(`❌ Expected 17 tasks, but got ${taskFields.length}`);
            return res.status(400).send(`❌ Invalid number of tasks. Expected 17, but got ${taskFields.length}`);
        }

        console.log("🔹 Prepared Values:", [student_id, 1, ...taskFields, date]);

        // SQL Query
        const query = `
            INSERT INTO Results 
            (student_id, form_id, task1, task2, task3, task4, task5, task6, task7, task8, task9, task10, task11, task12, task13, task14, task15, task16, task17, date) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [student_id.toString(), 1, ...taskFields, date];

        await db.promise().query(query, values);
        console.log("✅ Form data inserted successfully!");
        res.send("✅ Form1 submitted successfully.");
    } catch (error) {
        // console.error("❌ Error submitting Form1:", error);
        console.error(" Error submitting Form1:", error.message, error.stack);

    }
});

// app.get('/faculty', (req, res) => {
//     const query = 'SELECT faculty_id, teaches FROM faculty';  

//     db.query(query, (err, results) => {
//         if (err) {
//             console.error('Database query error:', err);
//             res.status(500).send('Database error');
//         } else {
//             console.log('Database Results:', results);
//             res.render('facultydata', { facultyList: results });
//         }
//     });
// });


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


// Set EJS as the templating engine
app.set("view engine", "ejs");
// 📌 Start Server
app.listen(3000, () => console.log("🚀 Server running on port 3000"));