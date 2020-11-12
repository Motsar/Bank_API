const Joi = require('@hapi/joi');


exports.registerValidation = (data) => {
    const schema = Joi.object({
        firstname: Joi.string()
            .min(2).
            required(),
        lastname: Joi.string()
            .min(2).
            required(),
        email: Joi.string()
            .min(6)
            .required()
            .email(),
        password: Joi.string()
            .min(6)
            .required(),
    });
    return schema.validate(data);
};

exports.loginValidation = (data) => {
    const schema = Joi.object({
        email: Joi.string()
            .min(6)
            .required()
            .email(),
        password: Joi.string()
            .min(6)
            .required()
    });
    return schema.validate(data);
};

exports.accountsValidation = (data) => {
    const schema = Joi.object({
        name: Joi.string()
            .min(2).
            required(),
        balance: Joi.number()
            .integer()
            .min(1)
            .required()
    });
    return schema.validate(data);
};

exports.transferValidation = (data) => {
    const schema = Joi.object({
        accountFrom: Joi.string()
            .max(100).
            required(),
        recieverName: Joi.string()
            .min(2).
            required(),
        accountTo: Joi.string()
            .max(100).
            required(),
        amount: Joi.number()
            .integer()
            .min(1)
            .required(),
        explanation: Joi.string()
            .min(2).
            required()
    });
    return schema.validate(data);
};