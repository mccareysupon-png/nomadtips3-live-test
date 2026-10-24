export function voteReadFailure(error){
 if(error?.status===404||error?.status===409)return{kind:'closed',message:'This match is no longer available for voting.'};
 if(error?.status===429)return{kind:'retry',message:'Voting is temporarily busy. Please retry shortly.'};
 return{kind:'retry',message:'Connection interrupted. Select RETRY VOTES to reconnect.'};
}
