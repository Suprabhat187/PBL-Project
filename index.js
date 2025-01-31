const express = require("express");
const ejsMate = require("ejs-mate");
const path = require("path");
const multer = require("multer");
const xlsx = require("xlsx");
const db = require("./database");

const app = express();


// Multer storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "uploads/");  // Save uploaded files to the 'uploads' folder
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname);  // Keep the original file name
    }
  });
  
  // Initialize multer with the storage configuration
  const upload = multer({ storage: storage });

app.engine("ejs", ejsMate);
app.use(express.static("css"));
app.use(express.static(path.join(__dirname, "hostit-html")));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));



// 📌 Routes
app.get("/", (req, res) => res.render("coordinatordash"));
app.get("/addstudent", (req, res) => res.render("addstudent"));
app.get("/addfaculty", (req, res) => res.render("addfaculty"));
app.get("/mapping", (req, res) => res.render("mapping"));
app.get("/coordinatordash", (req, res) => res.render("coordinatordash"));

// 📌 Handle Faculty-Student Mapping Form Submission
// Route for Faculty-Student Mapping
app.post("/submit-mapping", upload.single("studentFile"), async (req, res) => {
    const { facultyId, forms } = req.body;
  
    // Ensure that file and form data are provided
    if (!facultyId || !req.file || !forms) {
      return res.status(400).send("❌ Faculty ID, Student File, and Forms are required.");
    }
  
    // Check if faculty ID exists in the faculty table
    const [facultyExists] = await db.promise().query(
      "SELECT faculty_id FROM faculty WHERE faculty_id = ?",
      [facultyId]
    );
    if (facultyExists.length === 0) {
      return res.status(404).send("❌ Faculty ID not found.");
    }
  
    // Process the uploaded Excel file
    const filePath = path.join(__dirname, "uploads", req.file.filename);  // Path to the uploaded file
    const workbook = xlsx.readFile(filePath);  // Read the Excel file
    const sheetName = workbook.SheetNames[0];  // Get the name of the first sheet
    const sheet = workbook.Sheets[sheetName];  // Get the data from the first sheet
    const students = xlsx.utils.sheet_to_json(sheet);  // Convert the sheet to a JSON array
  
    // Validate that the sheet has student IDs in the 'PRN' column
    if (!students || students.length === 0) {
      return res.status(400).send("❌ No student data found in the uploaded file.");
    }
  
    // Extract the student IDs from the 'PRN' column
    const studentIds = students.map(student => student.PRN).filter(id => id);
  
    if (studentIds.length === 0) {
      return res.status(400).send("❌ No valid student IDs found.");
    }
  
    // Store the form access information
    const formAccess = forms.join(', ');  // Example: "Form 1, Form 2"
  
    try {
      // Insert mappings for each student
      for (const studentId of studentIds) {
        await db.promise().query(
          "INSERT INTO faculty_student_mapping (faculty_id, student_id, form_access) VALUES (?, ?, ?)",
          [facultyId, studentId, formAccess]
        );
      }
      res.send("✅ Mapping successful!");
    } catch (error) {
      console.error("❌ Error inserting mapping:", error);
      res.status(500).send("❌ Error during mapping.");
    }
  });
  
// 📌 Start Server
app.listen(3000, () => console.log("🚀 Server running on port 3000"));
