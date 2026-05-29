import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sourcesRouter from "./sources";
import flashcardsRouter from "./flashcards";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sourcesRouter);
router.use(flashcardsRouter);

export default router;
