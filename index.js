const express = require ("express")
const ejsMate = require ("ejs-mate")
const path = require ("path")
const app = express()
app.engine("ejs", ejsMate);
app.use(express.static("css"));
app.use(express.static(path.join(__dirname, 'hostit-html')));


app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.get('/',(req, res)=>{

    res.render("coordinatordash.ejs");
})
app.get("/addstudent", (req, res) => {
    res.render("addstudent"); // Ensure "addstudent.ejs" is in your views folder
  });
  app.get("/addfaculty", (req, res) => {
    res.render("addfaculty"); // Ensure "addstudent.ejs" is in your views folder
  });
  app.get("/mapping", (req, res) => {
    res.render("mapping"); // Ensure "addstudent.ejs" is in your views folder
  });
  app.get("/coordinatordash", (req, res) => {
    res.render("coordinatordash"); // Ensure "addstudent.ejs" is in your views folder
  });
 
  

app.listen(3000, () => {
    console.log("listening")
})

