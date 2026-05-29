import express from "express";
import cors from "cors";
import router from "./routes";

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, _res, next) => {
  console.log(req.method, req.url);
  next();
});

app.use("/api", router);

export default app;