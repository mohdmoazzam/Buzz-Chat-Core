const errorMiddleware = (err, req, res, next) => {
    err.message ||= "Something went wrong";
    err.statusCode ||= 400;

    if (err.name === "CastError") {
        err.message ||= "Id must be mongodb id";
        err.statusCode ||= 400;
    }

    return res.status(err.statusCode).json({
        success: false,
        message: err.message
    });
};

const TryCatch = (passedFunction) => async (req, res, next) => {
    try {
        await passedFunction(req, res, next);
    } catch (error) {
        next(error);
    }
};

export { errorMiddleware, TryCatch };