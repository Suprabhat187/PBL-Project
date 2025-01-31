const express = require ("express")
const ejsMate = require ("ejs-mate")
const path = require ("path")
const app = express()
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.get('/',(req, res)=>{

    res.render("coordinatordash.ejs");
})

app.listen(3000, () => {
    console.log("listening")
})

