const express = require("express")
const cors = require("cors")
const mysql = require("mysql2")
const jwt = require("jsonwebtoken")

const app = express()


const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, SECRET_KEY} = process.env
app.use(cors())
app.use(express.json())

app.post("/register", (request, response) => {
    const user = request.body.user

    const searchCommand = `
        SELECT * FROM Users
        WHERE email = ?
    `

    db.query(searchCommand, [user.email], (error, data) => {
        if(error) {
            console.log(error)
            return
        }

        if(data.length !== 0) {
            response.json({ message: "Já existe um usuário cadastrado com esse e-mail. Tente outro e-mail!", userExists: true})
            return
        }

        const insertCommand = `
            INSERT INTO Users(name, email, password)
            VALUES (?, ?, ?)
        `

        db.query(insertCommand, [user.name, user.email, user.password], (error) => {
            if(error) {
                console.log(error)
                return
            }

            response.json({ message: "Usuário cadastrado com sucesso!" })
        })
    })
})

app.post("/login", (request, response) =>{
    const user = request.body.user

    const searchCommand = `
        SELECT * FROM Users
        WHERE email = ?
    `

    db.query(searchCommand, [user.email], (error, data) => {
        if(error) {
            console.log(error)
            return
        }

        if(data.length === 0) {
            response.json({ message: "Não existe nenhum usuário com esse e-mail cadastrado!" })
            return
        }

        if(user.password === data[0].password) {
            const email = user.email
            const id = data[0].id
            const name = data[0].name

            const token = jwt.sign({ id, email, name }, SECRET_KEY, { expiresIn: "1h"})
            response.json({ token, ok: true})
            return
        }

        response.json({ message: "Credenciais inválidas! Tente Novamente"})
    })
})

app.get("/verify", (request, response) => {
    const token = request.headers.authorization

    jwt.verify(token, SECRET_KEY, (error, decoded) => {
        if(error) {
            response.json({ message: "Token inválido! Efetue o login novamente."})
            return
        }

        response.json({ ok: true })
    })
})

app.get("/getname", (request, response) => {
    const token = request.headers.authorization?.split(' ')[1]; // Remove o "Bearer" se presente

    if (!token) {
        return response.status(401).json({ message: "Token não fornecido!" });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        response.json({ name: decoded.name });
    } catch (error) {
        console.error("Erro ao verificar token:", error);
        response.status(401).json({ message: "Token inválido! Efetue o login novamente." });
    }
});

app.post("/start-quiz", (request, response) => {
    const token = request.headers.authorization;
    
    jwt.verify(token, SECRET_KEY, (error, decoded) => {
        if (error) {
            response.status(401).json({ message: "Token inválido! Efetue o login novamente." });
            return;
        }

        const userId = decoded.id;
        const username = decoded.name;

        const insertCommand = `
            INSERT INTO Ranking (user_id, username)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE username = ?
        `;

        db.query(insertCommand, [userId, username, username], (error) => {
            if (error) {
                console.log(error);
                response.status(500).json({ message: "Erro ao iniciar o quiz." });
                return;
            }

            response.json({ message: "Quiz iniciado com sucesso!" });
        });
    });
});

app.post("/update-xp", (request, response) => {
    console.log("Recebida requisição para /update-xp");
    console.log("Body:", request.body);
    console.log("Headers:", request.headers);

    const token = request.headers.authorization?.split(' ')[1];
    const { correctAnswers, quizId } = request.body;

    if (!token) {
        console.log("Token não fornecido");
        return response.status(401).json({ message: "Token não fornecido" });
    }

    jwt.verify(token, SECRET_KEY, (error, decoded) => {
        if (error) {
            console.log("Erro na verificação do token:", error);
            return response.status(401).json({ message: "Token inválido! Efetue o login novamente." });
        }

        console.log("Token decodificado:", decoded);

        const userId = decoded.id;
        const xpGained = correctAnswers * 10;

        console.log(`Atualizando XP: userId=${userId}, xpGained=${xpGained}, quizId=${quizId}`);

        const updateCommand = `
            UPDATE Ranking
            SET xp = COALESCE(xp, 0) + ?,
                quiz${quizId}_completed = TRUE
            WHERE user_id = ?
        `;

        db.query(updateCommand, [xpGained, userId], (error, result) => {
            if (error) {
                console.log("Erro na query de atualização:", error);
                return response.status(500).json({ message: "Erro ao atualizar XP.", error: error.message });
            }

            console.log("Resultado da atualização:", result);

            if (result.affectedRows === 0) {
                console.log("Nenhuma linha afetada, inserindo novo registro");
                const insertCommand = `
                    INSERT INTO Ranking (user_id, xp, quiz${quizId}_completed)
                    VALUES (?, ?, TRUE)
                `;

                db.query(insertCommand, [userId, xpGained], (insertError, insertResult) => {
                    if (insertError) {
                        console.log("Erro ao inserir novo registro:", insertError);
                        return response.status(500).json({ message: "Erro ao inserir novo registro no ranking.", error: insertError.message });
                    }

                    console.log("Novo registro inserido:", insertResult);
                    response.json({ message: "XP atualizado com sucesso!" });
                });
            } else {
                response.json({ message: "XP atualizado com sucesso!" });
            }
        });
    });
});

app.get("/ranking", (request, response) => {
    const selectCommand = `
        SELECT u.name as username, r.xp
        FROM Ranking r
        JOIN Users u ON r.user_id = u.id
        ORDER BY r.xp DESC
        LIMIT 10
    `;

    db.query(selectCommand, (error, data) => {
        if (error) {
            console.log("Erro ao obter o ranking:", error);
            response.status(500).json({ message: "Erro ao obter o ranking." });
            return;
        }

        console.log("Dados do ranking:", data);
        response.json(data);
    });
});

app.listen(3000, () => {
    console.log("Servidor rodando na porta 3000!!")
})

const db = mysql.createPool({
    connectionLimit: 10,
    host: DB_HOST,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD
})