import z from "zod";

export const validate =
	(schema, source = "body") =>
	(req, res, next) => {
        const result = schema.safeParse(req[source]);
        if(!result.success){
           return res.status(400).json({
                error:'Validation failed',

            })
        }
        req.valid = {...(req.valid || {}),[source]:result.data};
        next();
    };
