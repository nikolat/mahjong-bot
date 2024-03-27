import express from 'express';

export const page = () => {
	const app = express();
	const port = process.env.PORT || 3001;
	app.get('/', (req, res) => { 
		console.log('root access');
		res.status(204).send('');
	});
	const server = app.listen(port, () => console.log(`Example app listening on port ${port}!`));
	server.keepAliveTimeout = 120 * 1000;
	server.headersTimeout = 120 * 1000;
};
