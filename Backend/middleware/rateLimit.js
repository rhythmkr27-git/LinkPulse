import rateLimit from 'express-rate-limit';

const base = {standardHeaders:'draft-7',legacyHeaders: false};

export const createLimiter = rateLimit({
    ...base,
    windowMs:60_000,
    limit:20,
    message:'too many create request try again  in a minute'
}) 

export const authLimiter = rateLimit({
    ...base,
    windowMs:15*60_000,
    limit:30,
    message:'too many  attempts try again later'
})

export const unlockLimiter = rateLimit({
    ...base,
    windowMs:60_000,
    limit:10,
    message:'too many  attempts try again later'
})
